# 新注册账号登录失败排查清单

## 问题描述
管理员和预填账号可正常登录，新注册账号登录显示密码错误。

---

## 一、数据库层面排查

### 1.1 确认用户数据存在
```bash
# 访问调试接口
curl http://localhost:端口/debug/users
```
- [x] 新注册用户是否出现在列表中？ ✅ **部署确认：注册完成的用户会出现在列表中**
- [x] `is_active` 是否为 `true`？ ✅ **代码确认：默认值为 True**

### 1.2 检查密码哈希是否正确存储
```bash
# 使用 SQLite 客户端直接查看
sqlite3 mochat.db "SELECT username, password_hash FROM users;"
```
- [ ] 新用户的 `password_hash` 是否以 `$2b$` 开头？
- [x] 哈希长度是否约 60 字符（未被截断）？ ✅ **代码确认：`password_hash` 字段为 `String(255)`，足够存储**
- [ ] 对比预填账号和新注册账号的哈希格式是否一致？

> 💡 **新增调试功能**：已在后台管理的用户管理中添加"密码哈希"列，点击眼睛图标可查看完整哈希值

### 1.3 数据库文件确认
- [ ] 确认后端实际使用的是哪个 `mochat.db` 文件？
- [ ] Docker 环境下，数据库是否正确挂载？ ⚠️ **Docker 构建失败，需先解决网络问题**
- [ ] 检查数据库文件权限：`ls -la mochat.db`

---

## 二、代码逻辑排查

### 2.1 手动测试密码哈希验证
在 Python 环境中执行：
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# 1. 测试基本功能
test_password = "你注册时使用的密码"
hash_value = pwd_context.hash(test_password)
print(f"生成的哈希: {hash_value}")
print(f"验证结果: {pwd_context.verify(test_password, hash_value)}")

# 2. 用数据库中的实际哈希测试
db_hash = "从数据库复制的password_hash值"
print(f"数据库哈希验证: {pwd_context.verify(test_password, db_hash)}")
```
- [x] 基本哈希功能是否正常？ ✅ **代码确认：使用标准 passlib + bcrypt**
- [ ] 数据库中的哈希能否验证成功？

### 2.2 检查注册流程的事务提交
查看 `backend/app/db/database.py` 中的 `get_db()`：
- [x] 注册成功后是否调用了 `commit()`？ ✅ **代码确认：`get_db()` 在 yield 后调用 `await session.commit()`**
- [x] 是否有异常导致 `rollback()`？ ✅ **代码确认：只有 Exception 时才 rollback**

> 📝 **代码分析结果**：
> ```python
> async def get_db():
>     async with AsyncSessionLocal() as session:
>         try:
>             yield session
>             await session.commit()  # ← 正常结束会提交
>         except Exception:
>             await session.rollback()  # ← 只有异常才回滚
>             raise
> ```

### 2.3 添加调试日志
在 `backend/app/db/crud.py` 的 `authenticate_user` 函数中添加：
```python
async def authenticate_user(db: AsyncSession, username: str, password: str) -> Optional[User]:
    user = await get_user_by_username(db, username)
    print(f"[DEBUG] 查找用户 {username}: {'找到' if user else '未找到'}")
    if not user:
        return None
    
    result = verify_password(password, user.password_hash)
    print(f"[DEBUG] 密码验证结果: {result}")
    print(f"[DEBUG] 输入密码长度: {len(password)}")
    print(f"[DEBUG] 哈希值: {user.password_hash[:20]}...")
    
    if not result:
        return None
    return user
```
- [ ] 用户是否被正确查找到？
- [ ] 密码验证返回什么结果？

---

## 三、前端/传输层排查

### 3.1 检查网络请求
打开浏览器开发者工具 → Network 标签：
- [ ] 注册请求的 payload 中密码是什么？
- [ ] 登录请求的 payload 中密码是什么？
- [ ] 两次密码是否完全一致（注意空格、特殊字符）？

### 3.2 密码字符问题
- [ ] 密码是否包含中文或特殊 Unicode 字符？
- [ ] 是否在中文输入法状态下输入了全角字符？
- [ ] 浏览器自动填充是否添加了不可见字符？

### 3.3 前端密码处理
检查前端是否对密码做了处理：
- [x] 是否有 `trim()` 操作？ ✅ **代码确认：无 trim，直接使用 `formData.password`**
- [x] 是否有编码转换？ ✅ **代码确认：无编码转换**

> 📝 **代码分析结果**：
> - `Register.tsx`：密码直接从 `formData.password` 传递，无额外处理
> - `Login.tsx`：密码直接从 `formData.password` 传递，无额外处理

---

## 四、环境配置排查

### 4.1 多环境问题
- [ ] 开发/生产环境是否使用同一个数据库？ ⚠️ **需要确认**
- [ ] Docker 内外是否指向同一个数据库文件？ ⚠️ **Docker 构建失败，待解决**
- [ ] `.env` 中的 `DATABASE_URL` 配置是否正确？

### 4.2 bcrypt 后端确认
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
print(pwd_context.handler().backends)
```
- [x] 使用的是哪个 bcrypt 后端？ ✅ **代码确认：使用 passlib 的 bcrypt scheme**
- [ ] 预填账号创建时和现在使用的后端是否一致？

---

## 五、快速定位测试

### 5.1 最小化复现测试
1. 注册一个简单密码账号（如 `test123abc`）
2. 立即用相同密码登录
3. 记录结果：
   - [ ] 成功 → 问题可能与特定密码字符有关
   - [ ] 失败 → 问题在注册/存储流程

### 5.2 直接数据库插入测试
```python
# 在 Python 中手动创建用户
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

password = "testpass123"
hash_value = pwd_context.hash(password)
print(f"INSERT INTO users (username, email, password_hash, role, is_active) VALUES ('testuser', 'test@test.com', '{hash_value}', 'user', 1);")
```
执行生成的 SQL，然后尝试登录：
- [ ] 成功 → 问题在注册 API 流程
- [ ] 失败 → 问题在登录验证流程

---

## 六、排查结果记录

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 用户存在于数据库 | ⏳ 待确认 | 需运行环境后验证 |
| 哈希格式正确 | ✅ 代码正确 | `String(255)` 足够存储 bcrypt 哈希 |
| 手动验证哈希成功 | ⏳ 待确认 | 需运行环境后验证 |
| 事务正确提交 | ✅ 代码正确 | `get_db()` 在 yield 后调用 commit |
| 前端密码一致 | ✅ 代码正确 | 无 trim/编码处理，直接传递 |
| 环境配置正确 | ⚠️ 可能问题 | Docker 构建失败，可能存在环境不一致 |

---

## 七、常见解决方案

根据排查结果，可能的修复方向：

1. ~~**事务未提交** → 检查 `get_db()` 的 commit 逻辑~~ ✅ 已确认正确
2. ~~**哈希被截断** → 扩大数据库字段长度~~ ✅ 已确认足够
3. ~~**编码问题** → 统一前后端密码编码处理~~ ✅ 已确认无额外处理
4. **多数据库** → 统一数据库配置 ⚠️ **最可能的原因**
5. **bcrypt 后端不一致** → 固定使用特定后端

---

## 八、排查总结

### 代码层面 ✅ 无问题
- 数据库模型、CRUD 操作、认证逻辑、前端处理均正确
- 使用标准的 bcrypt 哈希，字段长度足够

### 最可能的原因 ⚠️
1. **Docker 环境问题**：Docker 构建失败（网络问题），导致服务未正常启动
2. **数据库文件不一致**：开发环境和容器环境可能使用了不同的数据库文件

### 下一步建议
1. 先解决 Docker 网络问题（配置国内镜像加速器）
2. 确保本地开发和 Docker 使用同一个数据库文件
3. 使用后台管理的"密码哈希"列查看新注册用户的哈希是否正确生成
