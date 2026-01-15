/**
 * PPT 生成服务 - Cloud Run
 * 
 * 接收 JSON 格式的 PPT 结构数据，生成 PPTX 文件
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import PptxGenJS from 'pptxgenjs';

const app = express();
const PORT = process.env.PORT || 8080;
const AUTH_SECRET = process.env.PPTGEN_CLOUDRUN_SECRET || '';

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 认证中间件（可选）
const authMiddleware = (req: Request, res: Response, next: Function) => {
  if (AUTH_SECRET) {
    const authHeader = req.headers['x-auth-secret'];
    if (authHeader !== AUTH_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  next();
};

// 类型定义
interface PPTTheme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
}

interface ContentItem {
  type: 'text' | 'bullet' | 'numbered';
  value?: string;
  items?: string[];
}

interface Slide {
  type: 'title' | 'toc' | 'section' | 'content' | 'two-column' | 'quote' | 'thank-you';
  title?: string;
  subtitle?: string;
  content?: ContentItem[];
  left?: ContentItem[];
  right?: ContentItem[];
  items?: string[];
  quote?: string;
  author?: string;
}

interface PPTData {
  title: string;
  author?: string;
  theme?: PPTTheme;
  slides: Slide[];
}

// 默认主题
const defaultTheme: PPTTheme = {
  primaryColor: '1a73e8',
  secondaryColor: '34a853',
  backgroundColor: 'ffffff',
  textColor: '202124',
  fontFamily: 'Microsoft YaHei'
};

// 生成幻灯片
function generateSlide(pptx: PptxGenJS, slide: Slide, theme: PPTTheme): void {
  const pptSlide = pptx.addSlide();
  const fontFace = theme.fontFamily || defaultTheme.fontFamily!;
  const primaryColor = theme.primaryColor || defaultTheme.primaryColor!;
  const textColor = theme.textColor || defaultTheme.textColor!;
  const bgColor = theme.backgroundColor || defaultTheme.backgroundColor!;

  // 设置背景色
  pptSlide.background = { color: bgColor };

  switch (slide.type) {
    case 'title':
      // 标题页
      pptSlide.addText(slide.title || '演示文稿', {
        x: 0.5,
        y: 2.5,
        w: '90%',
        h: 1.5,
        fontSize: 44,
        fontFace,
        color: primaryColor,
        bold: true,
        align: 'center'
      });
      if (slide.subtitle) {
        pptSlide.addText(slide.subtitle, {
          x: 0.5,
          y: 4,
          w: '90%',
          h: 0.8,
          fontSize: 24,
          fontFace,
          color: textColor,
          align: 'center'
        });
      }
      break;

    case 'toc':
      // 目录页
      pptSlide.addText(slide.title || '目录', {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: 0.8,
        fontSize: 32,
        fontFace,
        color: primaryColor,
        bold: true
      });
      if (slide.items && slide.items.length > 0) {
        const tocItems = slide.items.map((item, index) => ({
          text: `${index + 1}. ${item}`,
          options: { fontSize: 20, color: textColor, bullet: false }
        }));
        pptSlide.addText(tocItems, {
          x: 1,
          y: 1.5,
          w: '80%',
          h: 4,
          fontFace,
          paraSpaceAfter: 12
        });
      }
      break;

    case 'section':
      // 章节分隔页
      pptSlide.background = { color: primaryColor };
      pptSlide.addText(slide.title || '章节', {
        x: 0.5,
        y: 2.5,
        w: '90%',
        h: 1.5,
        fontSize: 40,
        fontFace,
        color: 'ffffff',
        bold: true,
        align: 'center'
      });
      break;

    case 'content':
      // 内容页
      pptSlide.addText(slide.title || '', {
        x: 0.5,
        y: 0.3,
        w: '90%',
        h: 0.7,
        fontSize: 28,
        fontFace,
        color: primaryColor,
        bold: true
      });
      if (slide.content && slide.content.length > 0) {
        let yPos = 1.2;
        for (const item of slide.content) {
          if (item.type === 'text' && item.value) {
            pptSlide.addText(item.value, {
              x: 0.5,
              y: yPos,
              w: '90%',
              h: 0.6,
              fontSize: 18,
              fontFace,
              color: textColor
            });
            yPos += 0.7;
          } else if ((item.type === 'bullet' || item.type === 'numbered') && item.items) {
            const bulletItems = item.items.map((text, idx) => ({
              text: item.type === 'numbered' ? `${idx + 1}. ${text}` : text,
              options: { 
                fontSize: 18, 
                color: textColor, 
                bullet: item.type === 'bullet' ? { type: 'bullet' as const } : false
              }
            }));
            pptSlide.addText(bulletItems, {
              x: 0.7,
              y: yPos,
              w: '85%',
              h: item.items.length * 0.5,
              fontFace,
              paraSpaceAfter: 8
            });
            yPos += item.items.length * 0.5 + 0.3;
          }
        }
      }
      break;

    case 'two-column':
      // 双栏布局
      pptSlide.addText(slide.title || '', {
        x: 0.5,
        y: 0.3,
        w: '90%',
        h: 0.7,
        fontSize: 28,
        fontFace,
        color: primaryColor,
        bold: true
      });
      // 左栏
      if (slide.left && slide.left.length > 0) {
        let yPos = 1.2;
        for (const item of slide.left) {
          if ((item.type === 'bullet' || item.type === 'numbered') && item.items) {
            const bulletItems = item.items.map((text, idx) => ({
              text: item.type === 'numbered' ? `${idx + 1}. ${text}` : text,
              options: { 
                fontSize: 16, 
                color: textColor, 
                bullet: item.type === 'bullet' ? { type: 'bullet' as const } : false
              }
            }));
            pptSlide.addText(bulletItems, {
              x: 0.5,
              y: yPos,
              w: '42%',
              h: item.items.length * 0.45,
              fontFace,
              paraSpaceAfter: 6
            });
            yPos += item.items.length * 0.45 + 0.2;
          } else if (item.type === 'text' && item.value) {
            pptSlide.addText(item.value, {
              x: 0.5,
              y: yPos,
              w: '42%',
              h: 0.5,
              fontSize: 16,
              fontFace,
              color: textColor
            });
            yPos += 0.6;
          }
        }
      }
      // 右栏
      if (slide.right && slide.right.length > 0) {
        let yPos = 1.2;
        for (const item of slide.right) {
          if ((item.type === 'bullet' || item.type === 'numbered') && item.items) {
            const bulletItems = item.items.map((text, idx) => ({
              text: item.type === 'numbered' ? `${idx + 1}. ${text}` : text,
              options: { 
                fontSize: 16, 
                color: textColor, 
                bullet: item.type === 'bullet' ? { type: 'bullet' as const } : false
              }
            }));
            pptSlide.addText(bulletItems, {
              x: 5.2,
              y: yPos,
              w: '42%',
              h: item.items.length * 0.45,
              fontFace,
              paraSpaceAfter: 6
            });
            yPos += item.items.length * 0.45 + 0.2;
          } else if (item.type === 'text' && item.value) {
            pptSlide.addText(item.value, {
              x: 5.2,
              y: yPos,
              w: '42%',
              h: 0.5,
              fontSize: 16,
              fontFace,
              color: textColor
            });
            yPos += 0.6;
          }
        }
      }
      break;

    case 'quote':
      // 引用页
      pptSlide.addText(`"${slide.quote || ''}"`, {
        x: 1,
        y: 2,
        w: '80%',
        h: 2,
        fontSize: 28,
        fontFace,
        color: primaryColor,
        italic: true,
        align: 'center'
      });
      if (slide.author) {
        pptSlide.addText(`— ${slide.author}`, {
          x: 1,
          y: 4,
          w: '80%',
          h: 0.5,
          fontSize: 18,
          fontFace,
          color: textColor,
          align: 'right'
        });
      }
      break;

    case 'thank-you':
      // 结束页
      pptSlide.background = { color: primaryColor };
      pptSlide.addText(slide.title || '感谢观看', {
        x: 0.5,
        y: 2,
        w: '90%',
        h: 1.5,
        fontSize: 44,
        fontFace,
        color: 'ffffff',
        bold: true,
        align: 'center'
      });
      if (slide.subtitle) {
        pptSlide.addText(slide.subtitle, {
          x: 0.5,
          y: 3.8,
          w: '90%',
          h: 0.8,
          fontSize: 20,
          fontFace,
          color: 'ffffff',
          align: 'center'
        });
      }
      break;

    default:
      // 默认处理为内容页
      pptSlide.addText(slide.title || '幻灯片', {
        x: 0.5,
        y: 0.5,
        w: '90%',
        h: 0.7,
        fontSize: 28,
        fontFace,
        color: primaryColor,
        bold: true
      });
  }
}

// 生成 PPT
async function generatePPT(data: PPTData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  
  // 设置基本信息
  pptx.title = data.title;
  if (data.author) {
    pptx.author = data.author;
  }
  pptx.company = 'Mochat';
  pptx.subject = data.title;

  // 合并主题
  const theme: PPTTheme = { ...defaultTheme, ...data.theme };

  // 生成每一页幻灯片
  for (const slide of data.slides) {
    generateSlide(pptx, slide, theme);
  }

  // 导出为 Buffer
  const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  return pptxBuffer;
}

// 路由
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'pptgen-cloudrun',
    status: 'running',
    version: '1.0.0'
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy' });
});

app.post('/generate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const pptData: PPTData = req.body;

    // 验证数据
    if (!pptData || !pptData.slides || pptData.slides.length === 0) {
      return res.status(400).json({ error: 'Invalid PPT data: missing slides' });
    }

    console.log(`Generating PPT: ${pptData.title}, ${pptData.slides.length} slides`);

    // 生成 PPT
    const pptxBuffer = await generatePPT(pptData);

    console.log(`PPT generated successfully: ${pptxBuffer.length} bytes`);

    // 返回文件
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pptData.title || 'presentation')}.pptx"`);
    res.setHeader('Content-Length', pptxBuffer.length.toString());
    res.send(pptxBuffer);

  } catch (error) {
    console.error('Error generating PPT:', error);
    res.status(500).json({ 
      error: 'Failed to generate PPT', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`PPT Generation Service listening on port ${PORT}`);
});
