# Cloud Run PPT 生成服务
FROM node:20-slim

WORKDIR /app

# 复制 package.json
COPY package*.json ./

# 安装依赖
RUN npm install --production=false

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 暴露端口（Cloud Run 使用 PORT 环境变量）
ENV PORT=8080
EXPOSE 8080

# 启动服务
CMD ["npm", "start"]
