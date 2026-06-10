"""
学习模块相关的 Pydantic 模型
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ---- 学习资料 ----

class MaterialTextCreate(BaseModel):
    """通过粘贴文本创建资料"""
    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(..., min_length=1)


class MaterialResponse(BaseModel):
    """学习资料响应"""
    id: int
    title: str
    file_type: str
    summary: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MaterialDetailResponse(MaterialResponse):
    """资料详情（含原文）"""
    raw_text: str


class MaterialListResponse(BaseModel):
    """资料列表响应"""
    materials: List[MaterialResponse]
    total: int


# ---- 文本分块 ----

class ChunkResponse(BaseModel):
    """分块响应"""
    id: int
    chunk_index: int
    content: str

    class Config:
        from_attributes = True


# ---- 学习会话 ----

class StudySessionCreate(BaseModel):
    """创建学习会话"""
    material_id: int
    title: str = Field(default="学习会话", max_length=200)


class StudySessionResponse(BaseModel):
    """学习会话响应"""
    id: int
    material_id: int
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class StudySessionListResponse(BaseModel):
    """学习会话列表响应"""
    sessions: List[StudySessionResponse]


# ---- 学习消息 ----

class StudyMessageCreate(BaseModel):
    """发送学习提问"""
    content: str = Field(..., min_length=1)
    model: Optional[str] = None


class StudyMessageResponse(BaseModel):
    """学习消息响应"""
    id: int
    role: str
    content: str
    thinking: Optional[str] = None
    cited_chunks: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class StudyMessagesResponse(BaseModel):
    """学习消息列表响应"""
    messages: List[StudyMessageResponse]


# ---- 闪卡 ----

class FlashcardResponse(BaseModel):
    """闪卡响应"""
    id: int
    material_id: int
    front: str
    back: str
    status: str
    review_count: int
    box_number: int
    interval: int
    next_review_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class FlashcardListResponse(BaseModel):
    """闪卡列表响应"""
    flashcards: List[FlashcardResponse]
    total: int


class FlashcardStatusUpdate(BaseModel):
    """更新闪卡状态"""
    status: str = Field(..., pattern=r"^(new|learning|mastered)$")


# ---- 测验 (Quiz) ----

class QuizQuestionResponse(BaseModel):
    """测验题目简要响应"""
    id: int
    quiz_id: int
    question_type: str
    question_text: str
    options: Optional[str] = None
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None

    class Config:
        from_attributes = True


class QuizQuestionDetailResponse(QuizQuestionResponse):
    """测验题目详细响应"""
    correct_answer: str
    explanation: Optional[str] = None


class StudyQuizResponse(BaseModel):
    """测验简要响应"""
    id: int
    material_id: int
    score: Optional[int] = None
    total_questions: int
    is_completed: bool
    created_at: datetime

    class Config:
        from_attributes = True


class StudyQuizDetailResponse(BaseModel):
    """测验详细响应"""
    quiz: StudyQuizResponse
    questions: List[QuizQuestionResponse]


class QuizSubmitAnswer(BaseModel):
    """单题作答"""
    question_id: int
    user_answer: str


class QuizSubmitRequest(BaseModel):
    """测验整卷提交"""
    answers: List[QuizSubmitAnswer]


class StudyQuizListResponse(BaseModel):
    """测验历史列表响应"""
    quizzes: List[StudyQuizResponse]
