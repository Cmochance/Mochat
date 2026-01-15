# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /build

# 复制文件（保持相对路径结构）
COPY frontend/ ./frontend/
COPY modules/ ./modules/

WORKDIR /build/frontend

# 安装依赖
RUN npm install --legacy-peer-deps

# 创建符号链接让 ../modules 能访问 node_modules
RUN ln -s /build/frontend/node_modules /build/node_modules

# 构建
RUN npm run build

# 生产阶段
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /build/frontend/dist /usr/share/nginx/html

# 复制nginx配置
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3721

CMD ["nginx", "-g", "daemon off;"]
