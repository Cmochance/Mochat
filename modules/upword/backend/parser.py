"""
文档解析器 - 将 Word 文档转换为 Markdown

转换策略: markitdown (首选) -> mammoth (备选) -> python-docx (最终回退)
"""

import io
import re
from typing import Optional, Tuple


class DocParser:
    """Word 文档解析器"""
    
    def _convert_with_markitdown(self, file_stream: io.BytesIO, filename: str) -> Optional[str]:
        """
        使用 markitdown 转换 (首选方案)
        Microsoft 官方工具，支持最佳的格式保留
        """
        try:
            from markitdown import MarkItDown
            
            md = MarkItDown()
            file_stream.seek(0)
            file_stream.name = filename
            
            result = md.convert_stream(file_stream)
            return self._clean_markdown(result.text_content)
            
        except ImportError:
            print("[Parser] markitdown 未安装，尝试备选方案")
            return None
        except AttributeError:
            print("[Parser] markitdown 版本不支持流式转换，尝试备选方案")
            return None
        except Exception as e:
            print(f"[Parser] markitdown 转换失败: {e}，尝试备选方案")
            return None
    
    def _convert_with_mammoth(self, file_stream: io.BytesIO) -> Optional[str]:
        """
        使用 mammoth 转换 (备选方案)
        专门针对 docx 的转换库，格式保留较好
        """
        try:
            import mammoth
            
            file_stream.seek(0)
            result = mammoth.convert_to_markdown(file_stream)
            
            if result.messages:
                for msg in result.messages:
                    print(f"[Parser] mammoth 警告: {msg}")
            
            return self._clean_markdown(result.value)
            
        except ImportError:
            print("[Parser] mammoth 未安装，尝试最终回退方案")
            return None
        except Exception as e:
            print(f"[Parser] mammoth 转换失败: {e}，尝试最终回退方案")
            return None
    
    def _convert_with_python_docx(self, file_stream: io.BytesIO) -> Optional[str]:
        """
        使用 python-docx 转换 (最终回退方案)
        基础文本提取，保留标题层级和表格结构
        """
        try:
            from docx import Document
            from docx.table import Table
            from docx.text.paragraph import Paragraph
            
            file_stream.seek(0)
            doc = Document(file_stream)
            
            markdown_parts = []
            
            for element in doc.element.body:
                # 处理段落
                if element.tag.endswith('p'):
                    para = Paragraph(element, doc)
                    text = para.text.strip()
                    if not text:
                        continue
                    
                    style_name = para.style.name if para.style else ""
                    if style_name.startswith('Heading'):
                        try:
                            level = int(style_name.replace('Heading', '').strip())
                            level = min(level, 6)
                            markdown_parts.append(f"{'#' * level} {text}\n")
                        except ValueError:
                            markdown_parts.append(f"{text}\n")
                    else:
                        markdown_parts.append(f"{text}\n")
                
                # 处理表格
                elif element.tag.endswith('tbl'):
                    table = Table(element, doc)
                    markdown_parts.append(self._table_to_markdown(table))
            
            return self._clean_markdown('\n'.join(markdown_parts))
            
        except ImportError:
            print("[Parser] python-docx 未安装，无法解析文档")
            return None
        except Exception as e:
            print(f"[Parser] python-docx 转换失败: {e}")
            return None
    
    def _table_to_markdown(self, table) -> str:
        """将 Word 表格转换为 Markdown 表格"""
        rows = []
        for row in table.rows:
            cells = [cell.text.strip().replace('\n', ' ') for cell in row.cells]
            rows.append('| ' + ' | '.join(cells) + ' |')
        
        if len(rows) >= 1:
            num_cols = len(table.rows[0].cells) if table.rows else 0
            separator = '| ' + ' | '.join(['---'] * num_cols) + ' |'
            rows.insert(1, separator)
        
        return '\n'.join(rows) + '\n'
    
    def _clean_markdown(self, text: str) -> str:
        """清理 Markdown 文本"""
        if not text:
            return ""
        
        text = re.sub(r'\n{3,}', '\n\n', text)
        lines = [line.rstrip() for line in text.split('\n')]
        text = '\n'.join(lines)
        text = text.strip()
        
        return text
    
    def parse(self, file_stream: io.BytesIO, filename: str) -> Tuple[bool, str]:
        """
        解析文档
        
        Args:
            file_stream: 文件内存流
            filename: 原始文件名
            
        Returns:
            Tuple[bool, str]: (成功标志, Markdown内容或错误信息)
        """
        lower_name = filename.lower()
        
        if not (lower_name.endswith('.doc') or lower_name.endswith('.docx')):
            return False, "不支持的文件格式，仅支持 .doc 和 .docx"
        
        markdown_text = None
        
        # 优先使用 markitdown
        if lower_name.endswith('.docx'):
            markdown_text = self._convert_with_markitdown(file_stream, filename)
        
        # 备选: mammoth (仅支持 docx)
        if markdown_text is None and lower_name.endswith('.docx'):
            markdown_text = self._convert_with_mammoth(file_stream)
        
        # 最终回退: python-docx (仅支持 docx)
        if markdown_text is None and lower_name.endswith('.docx'):
            markdown_text = self._convert_with_python_docx(file_stream)
        
        # .doc 格式的处理 (仅 markitdown 支持)
        if markdown_text is None and lower_name.endswith('.doc'):
            markdown_text = self._convert_with_markitdown(file_stream, filename)
            if markdown_text is None:
                return False, ".doc 格式需要安装 markitdown 库才能解析"
        
        if markdown_text is None:
            return False, "文档解析失败，请确保已安装 markitdown、mammoth 或 python-docx"
        
        if not markdown_text.strip():
            return False, "文档内容为空"
        
        return True, markdown_text


# 导出单例
doc_parser = DocParser()
