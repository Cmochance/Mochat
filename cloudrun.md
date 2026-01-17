```python
import functions_framework
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
import boto3
import os
import io
import json
import uuid
from datetime import datetime


# --- 辅助函数：颜色转换 ---
def hex_to_rgb(hex_color):
    """将十六进制颜色转换为 RGBColor"""
    if not hex_color:
        return RGBColor(0, 0, 0)
    hex_color = hex_color.lstrip('#')
    return RGBColor(
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16)
    )


# --- 幻灯片类型：title ---
def add_title_slide(prs, slide_data, theme):
    """标题页"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 标题
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2.5), Inches(9), Inches(1.5))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '演示文稿')
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = hex_to_rgb(theme.get('primaryColor'))
    p.alignment = PP_ALIGN.CENTER
    
    # 副标题
    if slide_data.get('subtitle'):
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(4), Inches(9), Inches(0.8))
        p = sub_box.text_frame.paragraphs[0]
        p.text = slide_data.get('subtitle')
        p.font.size = Pt(24)
        p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
        p.alignment = PP_ALIGN.CENTER


# --- 幻灯片类型：toc ---
def add_toc_slide(prs, slide_data, theme):
    """目录页"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 标题
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(0.8))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '目录')
    p.font.size = Pt(32)
    p.font.bold = True
    p.font.color.rgb = hex_to_rgb(theme.get('primaryColor'))
    
    # 目录项
    items = slide_data.get('items', [])
    if items:
        content_box = slide.shapes.add_textbox(Inches(1), Inches(1.5), Inches(8), Inches(4))
        tf = content_box.text_frame
        tf.word_wrap = True
        for i, item in enumerate(items):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = f"{i + 1}. {item}"
            p.font.size = Pt(20)
            p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
            p.space_after = Pt(12)


# --- 幻灯片类型：section ---
def add_section_slide(prs, slide_data, theme):
    """章节分隔页"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 设置背景色为主色
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = hex_to_rgb(theme.get('primaryColor'))
    
    # 标题（白色）
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2.5), Inches(9), Inches(1.5))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '章节')
    p.font.size = Pt(40)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)
    p.alignment = PP_ALIGN.CENTER


# --- 幻灯片类型：content ---
def add_content_slide(prs, slide_data, theme):
    """内容页 - 支持 text/bullet/numbered"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 标题
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '')
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = hex_to_rgb(theme.get('primaryColor'))
    
    # 内容渲染
    content_items = slide_data.get('content', [])
    y_pos = 1.2
    
    for item in content_items:
        if isinstance(item, str):
            # 纯字符串
            text_box = slide.shapes.add_textbox(Inches(0.5), Inches(y_pos), Inches(9), Inches(0.6))
            tf = text_box.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = item
            p.font.size = Pt(18)
            p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
            y_pos += 0.7
            
        elif isinstance(item, dict):
            item_type = item.get('type', 'text')
            
            if item_type == 'text':
                text_box = slide.shapes.add_textbox(Inches(0.5), Inches(y_pos), Inches(9), Inches(0.6))
                tf = text_box.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.text = item.get('value', '')
                p.font.size = Pt(18)
                p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
                y_pos += 0.7
                
            elif item_type in ('bullet', 'numbered'):
                items_list = item.get('items', [])
                if items_list:
                    content_box = slide.shapes.add_textbox(
                        Inches(0.7), Inches(y_pos), 
                        Inches(8.5), Inches(len(items_list) * 0.5)
                    )
                    tf = content_box.text_frame
                    tf.word_wrap = True
                    
                    for i, text in enumerate(items_list):
                        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                        if item_type == 'numbered':
                            p.text = f"{i + 1}. {text}"
                        else:
                            p.text = f"• {text}"
                        p.font.size = Pt(18)
                        p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
                        p.space_after = Pt(8)
                    
                    y_pos += len(items_list) * 0.5 + 0.3


# --- 幻灯片类型：two-column ---
def add_two_column_slide(prs, slide_data, theme):
    """双栏布局"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 标题
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(9), Inches(0.7))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '')
    p.font.size = Pt(28)
    p.font.bold = True
    p.font.color.rgb = hex_to_rgb(theme.get('primaryColor'))
    
    # 左栏
    left_items = slide_data.get('left', [])
    _render_column(slide, left_items, 0.5, theme)
    
    # 右栏
    right_items = slide_data.get('right', [])
    _render_column(slide, right_items, 5.2, theme)


def _render_column(slide, items, x_pos, theme):
    """渲染单栏内容"""
    y_pos = 1.2
    
    for item in items:
        if isinstance(item, dict):
            item_type = item.get('type', 'text')
            
            if item_type == 'text':
                text_box = slide.shapes.add_textbox(Inches(x_pos), Inches(y_pos), Inches(4.2), Inches(0.5))
                tf = text_box.text_frame
                tf.word_wrap = True
                p = tf.paragraphs[0]
                p.text = item.get('value', '')
                p.font.size = Pt(16)
                p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
                y_pos += 0.6
                
            elif item_type in ('bullet', 'numbered'):
                items_list = item.get('items', [])
                if items_list:
                    content_box = slide.shapes.add_textbox(
                        Inches(x_pos), Inches(y_pos), 
                        Inches(4.2), Inches(len(items_list) * 0.45)
                    )
                    tf = content_box.text_frame
                    tf.word_wrap = True
                    
                    for i, text in enumerate(items_list):
                        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
                        if item_type == 'numbered':
                            p.text = f"{i + 1}. {text}"
                        else:
                            p.text = f"• {text}"
                        p.font.size = Pt(16)
                        p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
                        p.space_after = Pt(6)
                    
                    y_pos += len(items_list) * 0.45 + 0.2


# --- 幻灯片类型：quote ---
def add_quote_slide(prs, slide_data, theme):
    """引用页"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 引用内容
    quote_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(8), Inches(2))
    tf = quote_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = f'"{slide_data.get("quote", "")}"'
    p.font.size = Pt(28)
    p.font.italic = True
    p.font.color.rgb = hex_to_rgb(theme.get('primaryColor'))
    p.alignment = PP_ALIGN.CENTER
    
    # 作者
    if slide_data.get('author'):
        author_box = slide.shapes.add_textbox(Inches(1), Inches(4), Inches(8), Inches(0.5))
        p = author_box.text_frame.paragraphs[0]
        p.text = f"— {slide_data.get('author')}"
        p.font.size = Pt(18)
        p.font.color.rgb = hex_to_rgb(theme.get('textColor'))
        p.alignment = PP_ALIGN.RIGHT


# --- 幻灯片类型：thank-you ---
def add_thank_you_slide(prs, slide_data, theme):
    """结束页"""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    
    # 设置背景色为主色
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = hex_to_rgb(theme.get('primaryColor'))
    
    # 标题（白色）
    title_box = slide.shapes.add_textbox(Inches(0.5), Inches(2), Inches(9), Inches(1.5))
    p = title_box.text_frame.paragraphs[0]
    p.text = slide_data.get('title', '感谢观看')
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = RGBColor(255, 255, 255)
    p.alignment = PP_ALIGN.CENTER
    
    # 副标题
    if slide_data.get('subtitle'):
        sub_box = slide.shapes.add_textbox(Inches(0.5), Inches(3.8), Inches(9), Inches(0.8))
        p = sub_box.text_frame.paragraphs[0]
        p.text = slide_data.get('subtitle')
        p.font.size = Pt(20)
        p.font.color.rgb = RGBColor(255, 255, 255)
        p.alignment = PP_ALIGN.CENTER


# --- 核心入口函数 ---
@functions_framework.http
def pptgen(request):
    """
    Cloud Run PPT 生成服务入口
    
    接收 JSON 格式的 PPT 结构数据，生成 PPTX 文件并上传到 R2，返回下载链接
    """
    # 1. CORS 处理
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Auth-Secret',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    }

    # 2. 鉴权
    auth_secret = request.headers.get("X-Auth-Secret") or request.headers.get("Authorization")
    env_token = os.environ.get("AUTH_TOKEN") or os.environ.get("PPTGEN_CLOUDRUN_SECRET", "")
    if env_token and auth_secret != env_token:
        return (json.dumps({"error": "Unauthorized"}), 401, headers)

    # 3. 解析请求
    try:
        request_json = request.get_json(silent=True)
        if not request_json:
            return (json.dumps({"error": "Invalid JSON"}), 400, headers)
        
        # 兼容两种格式：直接传 ppt_data 或包一层
        ppt_data = request_json.get("ppt_data", request_json)
        filename = request_json.get("filename", ppt_data.get("title", "presentation"))
        user_id = request_json.get("user_id", "anonymous")
        
        if not ppt_data or 'slides' not in ppt_data:
            return (json.dumps({"error": "Missing slides data"}), 400, headers)
            
    except Exception as e:
        return (json.dumps({"error": str(e)}), 400, headers)

    # 4. 生成 PPT
    try:
        prs = Presentation()
        prs.slide_width = Inches(10)
        prs.slide_height = Inches(7.5)
        
        # 默认主题
        default_theme = {
            'primaryColor': '1a73e8',
            'secondaryColor': '34a853',
            'backgroundColor': 'ffffff',
            'textColor': '202124'
        }
        theme = {**default_theme, **ppt_data.get('theme', {})}

        # 遍历生成幻灯片
        for slide_data in ppt_data.get('slides', []):
            slide_type = slide_data.get('type', 'content')
            
            if slide_type == 'title':
                add_title_slide(prs, slide_data, theme)
            elif slide_type == 'toc':
                add_toc_slide(prs, slide_data, theme)
            elif slide_type == 'section':
                add_section_slide(prs, slide_data, theme)
            elif slide_type == 'content':
                add_content_slide(prs, slide_data, theme)
            elif slide_type == 'two-column':
                add_two_column_slide(prs, slide_data, theme)
            elif slide_type == 'quote':
                add_quote_slide(prs, slide_data, theme)
            elif slide_type == 'thank-you':
                add_thank_you_slide(prs, slide_data, theme)
            else:
                # 未知类型默认使用内容页
                add_content_slide(prs, slide_data, theme)

        # 保存到内存流
        ppt_stream = io.BytesIO()
        prs.save(ppt_stream)
        ppt_stream.seek(0)
        
    except Exception as e:
        return (json.dumps({"error": f"PPT Generation Error: {str(e)}"}), 500, headers)

    # 5. 上传到 R2
    try:
        s3 = boto3.client(
            's3',
            endpoint_url=f"https://{os.environ.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
            aws_access_key_id=os.environ.get('R2_ACCESS_KEY_ID'),
            aws_secret_access_key=os.environ.get('R2_SECRET_ACCESS_KEY')
        )

        # 生成唯一文件名
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        # 清理文件名中的特殊字符
        safe_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '_', '中文'))
        safe_filename = safe_filename[:50] or "presentation"
        
        r2_key = f"ppt/{user_id}/{timestamp}_{unique_id}_{safe_filename}.pptx"
        
        s3.upload_fileobj(
            ppt_stream, 
            os.environ.get('R2_BUCKET_NAME'), 
            r2_key,
            ExtraArgs={
                'ContentType': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'ContentDisposition': f'attachment; filename="{safe_filename}.pptx"'
            }
        )
        
        # 构建公开访问 URL
        public_domain = os.environ.get('R2_PUBLIC_DOMAIN', '')
        if public_domain:
            ppt_url = f"{public_domain}/{r2_key}"
        else:
            ppt_url = f"https://{os.environ.get('R2_BUCKET_NAME')}.r2.cloudflarestorage.com/{r2_key}"
        
        return (json.dumps({
            "status": "success",
            "url": ppt_url,
            "title": ppt_data.get('title', '演示文稿')
        }), 200, headers)

    except Exception as e:
        return (json.dumps({"error": f"Upload R2 Error: {str(e)}"}), 500, headers)
```

## 环境变量配置

Cloud Run 需要配置以下环境变量：

```env
# 鉴权密钥（可选，与后端 PPTGEN_CLOUDRUN_SECRET 保持一致）
AUTH_TOKEN=your-secret
# 或
PPTGEN_CLOUDRUN_SECRET=your-secret

# R2 配置
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=xxx
R2_PUBLIC_DOMAIN=https://your-r2-domain.com
```

## 支持的幻灯片类型

| 类型 | 说明 |
|------|------|
| title | 标题页 |
| toc | 目录页 |
| section | 章节分隔页 |
| content | 内容页（支持 text/bullet/numbered） |
| two-column | 双栏布局 |
| quote | 引用页 |
| thank-you | 结束页 |

## 部署命令

```bash
gcloud functions deploy pptgen \
  --gen2 \
  --runtime=python311 \
  --region=asia-east1 \
  --source=. \
  --entry-point=pptgen \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars AUTH_TOKEN=xxx,R2_ACCOUNT_ID=xxx,R2_ACCESS_KEY_ID=xxx,R2_SECRET_ACCESS_KEY=xxx,R2_BUCKET_NAME=xxx,R2_PUBLIC_DOMAIN=xxx
```
