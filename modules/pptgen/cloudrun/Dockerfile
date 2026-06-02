# Cloud Run PPT 生成服务 (Python Functions Framework)
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PORT=8080

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

# Cloud Run 会将 HTTP 请求转发到 functions-framework
CMD ["functions-framework", "--target=pptgen", "--source=main.py", "--host=0.0.0.0", "--port=8080"]
