"""
学习模块 API 路由
"""

import asyncio
import io
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.dependencies import get_current_active_user
from ..db import crud
from ..db.database import get_db
from ..db.models import User
from ..schemas.learn import (
    AnnotationCreate,
    AnnotationListResponse,
    AnnotationResponse,
    EvaluationReportResponse,
    FlashcardListResponse,
    FlashcardResponse,
    FlashcardStatusUpdate,
    LearningMapResponse,
    MaterialDetailResponse,
    MaterialListResponse,
    MaterialResponse,
    MaterialTextCreate,
    QuizSubmitRequest,
    StudyMessageCreate,
    StudyMessagesResponse,
    StudyQuizListResponse,
    StudyQuizResponse,
    StudySessionCreate,
    StudySessionListResponse,
    StudySessionResponse,
    WrongQuestionsListResponse,
)
from ..services.audio_service import (
    generate_podcast_audio,
    generate_summary_audio,
)
from ..services.learn_service import (
    chunk_text,
    extract_text,
    generate_adaptive_quiz,
    generate_evaluation_report,
    generate_flashcards,
    generate_learning_map,
    generate_quiz,
    generate_summary,
    retrieve_relevant_chunks,
    study_chat_stream,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 上传文件存储目录
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "learn")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 允许的文件类型
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".docx"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ============ 资料管理 ============


@router.post("/materials/upload", response_model=MaterialResponse)
async def upload_material(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """上传文件创建学习资料"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="文件名不能为空")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制（最大 {MAX_FILE_SIZE // 1024 // 1024} MB）")

    try:
        file_type, raw_text = extract_text(file.filename, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="文件内容为空或无法提取文本")

    title = os.path.splitext(file.filename)[0]

    # 保存文件到磁盘
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, file.filename)
    with open(file_path, "wb") as f:
        f.write(data)

    # 创建资料记录
    material = await crud.create_learning_material(
        db=db,
        user_id=current_user.id,
        title=title,
        file_type=file_type,
        raw_text=raw_text,
        file_path=file_path,
    )

    # 分块
    chunks = chunk_text(raw_text)
    await crud.create_material_chunks(db=db, material_id=material.id, chunks=chunks)

    # 自动生成摘要（失败不阻塞上传）
    try:
        summary = await generate_summary(raw_text)
        await crud.update_material_summary(db, material.id, summary)
        material.summary = summary
    except Exception as e:
        logger.warning("自动生成摘要失败（不影响上传）: %s", e)

    return material


@router.post("/materials/text", response_model=MaterialResponse)
async def create_text_material(
    body: MaterialTextCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """通过粘贴文本创建学习资料"""
    material = await crud.create_learning_material(
        db=db,
        user_id=current_user.id,
        title=body.title,
        file_type="text",
        raw_text=body.content,
    )

    chunks = chunk_text(body.content)
    await crud.create_material_chunks(db=db, material_id=material.id, chunks=chunks)

    # 自动生成摘要（失败不阻塞上传）
    try:
        summary = await generate_summary(body.content)
        await crud.update_material_summary(db, material.id, summary)
        material.summary = summary
    except Exception as e:
        logger.warning("自动生成摘要失败（不影响上传）: %s", e)

    return material


@router.get("/materials", response_model=MaterialListResponse)
async def list_materials(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取当前用户的学习资料列表"""
    materials = await crud.get_user_materials(db, current_user.id, skip=skip, limit=limit)
    return MaterialListResponse(materials=materials, total=len(materials))


@router.get("/materials/{material_id}", response_model=MaterialDetailResponse)
async def get_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取资料详情"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")
    return material


@router.delete("/materials/{material_id}")
async def delete_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """删除学习资料"""
    ok = await crud.delete_material(db, material_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="资料不存在")
    return {"ok": True}


@router.post("/materials/{material_id}/summary")
async def get_or_generate_summary(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """生成或获取资料摘要"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    if material.summary:
        return {"summary": material.summary}

    summary = await generate_summary(material.raw_text)
    await crud.update_material_summary(db, material_id, summary)
    return {"summary": summary}


# ============ 学习会话 ============


@router.post("/sessions", response_model=StudySessionResponse)
async def create_study_session(
    body: StudySessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """创建学习会话"""
    material = await crud.get_material_by_id(db, body.material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    session = await crud.create_study_session(
        db=db,
        user_id=current_user.id,
        material_id=body.material_id,
        title=body.title,
    )
    return session


@router.get("/sessions", response_model=StudySessionListResponse)
async def list_study_sessions(
    material_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取学习会话列表"""
    sessions = await crud.get_user_study_sessions(db, current_user.id, material_id=material_id)
    return StudySessionListResponse(sessions=sessions)


@router.delete("/sessions/{session_id}")
async def delete_study_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """删除学习会话"""
    ok = await crud.delete_study_session(db, session_id, current_user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {"ok": True}


# ============ 学习对话 ============


@router.get("/sessions/{session_id}/messages", response_model=StudyMessagesResponse)
async def get_study_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取学习会话的消息列表"""
    session = await crud.get_study_session_by_id(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    messages = await crud.get_study_messages(db, session_id)
    return StudyMessagesResponse(messages=messages)


@router.post("/sessions/{session_id}/messages")
async def send_study_message(
    session_id: int,
    body: StudyMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    发送学习提问（SSE 流式返回）。
    同时将用户消息和 AI 回复持久化。
    """
    session = await crud.get_study_session_by_id(db, session_id, current_user.id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")

    # 获取资料分块
    chunks = await crud.get_material_chunks(db, session.material_id)

    # 检索相关分块
    relevant = retrieve_relevant_chunks(body.content, chunks, top_k=5)
    context_texts = [c.content for c, _score in relevant]
    cited_indices = [c.chunk_index for c, _score in relevant]
    if body.highlight_context:
        context_texts = [f"[用户选中的文本片段（重点理解）]: {body.highlight_context}"] + context_texts

    # 构建对话历史
    history_msgs = await crud.get_study_messages(db, session_id, limit=20)
    history = [{"role": m.role, "content": m.content} for m in history_msgs]

    # 保存用户消息
    await crud.create_study_message(db, session_id, role="user", content=body.content)
    await db.commit()

    # 流式生成 AI 回复
    async def event_generator():
        full_content = ""
        full_thinking = ""

        try:
            async for chunk in study_chat_stream(
                user_message=body.content,
                context_chunks=context_texts,
                history=history,
                model=body.model,
            ):
                if chunk["type"] == "thinking":
                    full_thinking += chunk["data"]
                elif chunk["type"] == "content":
                    full_content += chunk["data"]
                # 转发给前端
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)

            # 保存 AI 回复
            await crud.create_study_message(
                db,
                session_id,
                role="assistant",
                content=full_content,
                thinking=full_thinking if full_thinking else None,
                cited_chunks=json.dumps(cited_indices),
            )
            await db.commit()
        except Exception as e:
            logger.error("生成学习对话流式输出失败: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'data': str(e)}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'data': ''})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============ 闪卡 ============


@router.post("/materials/{material_id}/flashcards", response_model=FlashcardListResponse)
async def create_flashcards_for_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """为资料生成闪卡（如已有则先删除再重新生成）"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    # 删除旧闪卡
    await crud.delete_flashcards_by_material(db, material_id)

    # AI 生成
    cards = await generate_flashcards(material.raw_text)
    if not cards:
        raise HTTPException(status_code=500, detail="闪卡生成失败，请重试")

    flashcards = await crud.create_flashcards(db, material_id, cards)
    await db.commit()
    return FlashcardListResponse(flashcards=flashcards, total=len(flashcards))


@router.get("/materials/{material_id}/flashcards", response_model=FlashcardListResponse)
async def list_flashcards(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取资料的闪卡列表"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    flashcards = await crud.get_flashcards_by_material(db, material_id)
    return FlashcardListResponse(flashcards=flashcards, total=len(flashcards))


@router.get("/materials/{material_id}/flashcards/due", response_model=FlashcardListResponse)
async def list_due_flashcards(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取资料中今天到期需要复习的闪卡列表"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    flashcards = await crud.get_due_flashcards_by_material(db, material_id)
    return FlashcardListResponse(flashcards=flashcards, total=len(flashcards))


@router.patch("/flashcards/{card_id}/status", response_model=FlashcardResponse)
async def update_flashcard_status(
    card_id: int,
    body: FlashcardStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """更新闪卡状态（标记为 learning / mastered）"""
    card = await crud.get_flashcard_by_id(db, card_id, current_user.id)
    if not card:
        raise HTTPException(status_code=404, detail="闪卡不存在")

    updated = await crud.update_flashcard_status(db, card_id, body.status)
    await db.commit()
    return updated


# ============ 测验 (Quiz) ============


@router.post("/materials/{material_id}/quizzes", response_model=StudyQuizResponse)
async def create_quiz_for_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """为资料生成新测验"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    # AI 生成题目
    ai_questions = await generate_quiz(material.raw_text)
    if not ai_questions:
        raise HTTPException(status_code=500, detail="生成测验试题失败，请重试")

    # 创建测验主记录
    quiz = await crud.create_study_quiz(db, material_id, current_user.id, len(ai_questions))

    # 转换并保存题目
    db_questions = []
    for q in ai_questions:
        opts_json = json.dumps(q.get("options")) if q.get("options") else None
        db_questions.append(
            {
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "options": opts_json,
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation"),
            }
        )

    await crud.create_quiz_questions(db, quiz.id, db_questions)
    await db.commit()
    return quiz


# ============ 划词高亮与批注 (Annotations) ============


@router.post("/materials/{material_id}/annotations", response_model=AnnotationResponse)
async def add_material_annotation(
    material_id: int,
    body: AnnotationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """为学习资料添加划词批注高亮"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    anno = await crud.create_annotation(
        db,
        material_id=material_id,
        user_id=current_user.id,
        selected_text=body.selected_text,
        note=body.note,
        color=body.color or "yellow",
        start_offset=body.start_offset,
        end_offset=body.end_offset,
    )
    await db.commit()
    return anno


@router.get("/materials/{material_id}/annotations", response_model=AnnotationListResponse)
async def list_material_annotations(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取学习资料的全部划词批注"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    annos = await crud.get_annotations_by_material(db, material_id, current_user.id)
    return {"annotations": annos}


@router.delete("/annotations/{annotation_id}")
async def delete_material_annotation(
    annotation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """删除划词批注"""
    success = await crud.delete_annotation(db, annotation_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="批注不存在")
    await db.commit()
    return {"success": True}


@router.get("/quizzes", response_model=StudyQuizListResponse)
async def list_quizzes(
    material_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取历史测验列表"""
    quizzes = await crud.get_user_quizzes(db, current_user.id, material_id)
    return StudyQuizListResponse(quizzes=quizzes)


@router.get("/quizzes/{quiz_id}")
async def get_quiz_detail(
    quiz_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取单个测验的详细数据，包括题目（未完成时不返回正确答案和解析）"""
    quiz = await crud.get_study_quiz_by_id(db, quiz_id, current_user.id)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")

    questions = await crud.get_quiz_questions(db, quiz_id)

    # 动态构建返回结构，处理题目数据的保密性
    result_questions = []
    for q in questions:
        q_data = {
            "id": q.id,
            "quiz_id": q.quiz_id,
            "question_type": q.question_type,
            "question_text": q.question_text,
            "options": q.options,
            "user_answer": q.user_answer,
            "is_correct": q.is_correct,
        }
        if quiz.is_completed:
            q_data["correct_answer"] = q.correct_answer
            q_data["explanation"] = q.explanation
        result_questions.append(q_data)

    return {"quiz": quiz, "questions": result_questions}


@router.post("/quizzes/{quiz_id}/submit")
async def submit_quiz(
    quiz_id: int,
    body: QuizSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """提交测验答案，执行判定与算分"""
    quiz = await crud.get_study_quiz_by_id(db, quiz_id, current_user.id)
    if not quiz:
        raise HTTPException(status_code=404, detail="测验不存在")
    if quiz.is_completed:
        raise HTTPException(status_code=400, detail="该测验已提交，不可重复提交")

    questions = await crud.get_quiz_questions(db, quiz_id)
    q_map = {q.id: q for q in questions}

    correct_count = 0
    for ans in body.answers:
        q = q_map.get(ans.question_id)
        if not q:
            continue

        user_ans = ans.user_answer.strip()
        correct_ans = q.correct_answer.strip()
        is_correct = user_ans == correct_ans

        if is_correct:
            correct_count += 1

        await crud.submit_quiz_answer(db, q.id, user_ans, is_correct)

    await crud.complete_study_quiz(db, quiz_id, correct_count)
    await db.commit()

    # 重新加载题目列表返回给前端
    questions = await crud.get_quiz_questions(db, quiz_id)
    return {
        "quiz": {
            "id": quiz.id,
            "material_id": quiz.material_id,
            "score": correct_count,
            "total_questions": quiz.total_questions,
            "is_completed": True,
            "created_at": quiz.created_at,
        },
        "questions": [
            {
                "id": q.id,
                "quiz_id": q.quiz_id,
                "question_type": q.question_type,
                "question_text": q.question_text,
                "options": q.options,
                "user_answer": q.user_answer,
                "is_correct": q.is_correct,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
            }
            for q in questions
        ],
    }


# ============ 知识导图 / 图谱 (LearningMap) ============


@router.post("/materials/{material_id}/maps", response_model=LearningMapResponse)
async def generate_material_map(
    material_id: int,
    map_type: str,  # mindmap / concept_graph
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """为资料生成思维导图或概念关系图谱"""
    if map_type not in ("mindmap", "concept_graph"):
        raise HTTPException(status_code=400, detail="不支持的图谱类型")

    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    # AI 生成
    map_dict = await generate_learning_map(material.raw_text, map_type)
    if not map_dict:
        raise HTTPException(status_code=500, detail="生成失败，请稍后重试")

    # 保存/覆盖数据
    lmap = await crud.create_learning_map(
        db=db,
        material_id=material_id,
        map_type=map_type,
        map_data=json.dumps(map_dict, ensure_ascii=False),
    )
    await db.commit()
    return lmap


@router.get("/materials/{material_id}/maps", response_model=LearningMapResponse)
async def get_material_map(
    material_id: int,
    map_type: str,  # mindmap / concept_graph
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取资料的思维导图或概念关系图谱"""
    if map_type not in ("mindmap", "concept_graph"):
        raise HTTPException(status_code=400, detail="不支持的图谱类型")

    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    lmap = await crud.get_learning_map_by_type(db, material_id, map_type)
    if not lmap:
        raise HTTPException(status_code=404, detail="图谱尚未生成")

    return lmap


# ============ 错题本与学习诊断评估 (Evaluation & Wrong Questions) ============


@router.get("/materials/{material_id}/wrong-questions", response_model=WrongQuestionsListResponse)
async def get_wrong_questions_for_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取指定资料下用户的所有错题"""
    wrong_questions = await crud.get_wrong_questions(db, current_user.id, material_id)
    return {"wrong_questions": wrong_questions}


@router.get("/materials/{material_id}/evaluation", response_model=EvaluationReportResponse)
async def get_evaluation_for_material(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """获取AI学习诊断评估报告"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    # 1. 测验统计
    quizzes = await crud.get_user_quizzes(db, current_user.id, material_id)
    completed_quizzes = [q for q in quizzes if q.is_completed]
    quizzes_count = len(completed_quizzes)

    total_score = sum(q.score or 0 for q in completed_quizzes)
    total_questions = sum(q.total_questions for q in completed_quizzes)
    average_accuracy = (total_score / total_questions * 100) if total_questions > 0 else 0.0

    # 2. 错题集统计
    wrong_questions = await crud.get_wrong_questions(db, current_user.id, material_id)
    wrong_questions_count = len(wrong_questions)

    # 3. 闪卡统计
    flashcards = await crud.get_flashcards_by_material(db, material_id)
    flashcards_total = len(flashcards)
    flashcards_by_box = [0, 0, 0, 0, 0]
    for card in flashcards:
        box = card.box_number or 1
        box = max(1, min(5, box))
        flashcards_by_box[box - 1] += 1

    # 4. 生成 AI 诊断报告
    flashcard_progress_str = ", ".join([f"第{i + 1}盒: {count}张" for i, count in enumerate(flashcards_by_box)])
    material_summary = material.summary or material.raw_text[:2000]

    ai_diagnostic = await generate_evaluation_report(
        material_summary=material_summary,
        quiz_accuracy=average_accuracy,
        wrong_questions=wrong_questions,
        flashcard_progress=flashcard_progress_str,
    )

    return {
        "quizzes_count": quizzes_count,
        "average_accuracy": average_accuracy,
        "wrong_questions_count": wrong_questions_count,
        "flashcards_total": flashcards_total,
        "flashcards_by_box": flashcards_by_box,
        "ai_diagnostic": ai_diagnostic,
    }


@router.post("/materials/{material_id}/adaptive-quiz", response_model=StudyQuizResponse)
async def create_adaptive_quiz(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """为资料生成基于错题的自适应强化测验"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    # 查询错题
    wrong_questions = await crud.get_wrong_questions(db, current_user.id, material_id)

    # AI 生成针对性的自适应题目
    ai_questions = await generate_adaptive_quiz(material.raw_text, wrong_questions)
    if not ai_questions:
        raise HTTPException(status_code=500, detail="生成自适应强化测验试题失败，请重试")

    # 创建测验主记录
    quiz = await crud.create_study_quiz(db, material_id, current_user.id, len(ai_questions))

    # 转换并保存题目
    db_questions = []
    for q in ai_questions:
        opts_json = json.dumps(q.get("options")) if q.get("options") else None
        db_questions.append(
            {
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "options": opts_json,
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation"),
            }
        )

    await crud.create_quiz_questions(db, quiz.id, db_questions)
    await db.commit()
    return quiz


# ============ 有声书/播客 API ============


@router.post("/materials/{material_id}/audio/summary")
async def generate_audio_summary(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """生成摘要朗读音频"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    try:
        audio_bytes, summary_text = await generate_summary_audio(material.raw_text)
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"attachment; filename=summary_{material_id}.mp3",
                "X-Summary-Text": summary_text[:500],
            },
        )
    except Exception as e:
        logger.error("生成摘要音频失败: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/materials/{material_id}/audio/podcast")
async def generate_audio_podcast(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """生成双人播客音频"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    try:
        audio_bytes, dialogue = await generate_podcast_audio(material.raw_text)
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"attachment; filename=podcast_{material_id}.mp3",
                "X-Dialogue-Count": str(len(dialogue)),
            },
        )
    except Exception as e:
        logger.error("生成播客音频失败: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/materials/{material_id}/audio/podcast/script")
async def generate_podcast_script(
    material_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """仅生成播客对话脚本（不生成音频）"""
    material = await crud.get_material_by_id(db, material_id, current_user.id)
    if not material:
        raise HTTPException(status_code=404, detail="资料不存在")

    try:
        from ..services.audio_service import _generate_podcast_script

        dialogue = await _generate_podcast_script(material.raw_text)
        return {
            "script": [{"speaker": s, "text": t} for s, t in dialogue],
        }
    except Exception as e:
        logger.error("生成播客脚本失败: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
