"""
Mochat 安全回归测试

运行方式:
  cd backend
  source venv/bin/activate
  python -m pytest tests/test_security.py -v

或直接运行:
  python tests/test_security.py
"""

import re
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ============ 1. 密码安全测试 ============

class TestPasswordSecurity:
    """密码哈希和验证相关测试"""

    def test_bcrypt_hash_is_one_way(self):
        """bcrypt 哈希应该是单向的，无法还原原始密码"""
        from app.core.security import get_password_hash, verify_password

        password = "TestPassword123!"
        hashed = get_password_hash(password)

        # 哈希不等于原始密码
        assert hashed != password
        # 哈希以 $2b$ 开头（bcrypt 标识）
        assert hashed.startswith("$2b$")
        # 可以正确验证
        assert verify_password(password, hashed) is True
        # 错误密码验证失败
        assert verify_password("WrongPassword", hashed) is False

    def test_encrypt_password_not_available(self):
        """encrypt_password 和 decrypt_password 不应存在于 security 模块中"""
        import app.core.security as security_module

        assert not hasattr(security_module, "encrypt_password"), \
            "encrypt_password 不应存在（已移除可逆加密）"
        assert not hasattr(security_module, "decrypt_password"), \
            "decrypt_password 不应存在（已移除可逆加密）"
        assert not hasattr(security_module, "_get_fernet_key"), \
            "_get_fernet_key 不应存在（已移除 Fernet 加密）"


# ============ 2. SECRET_KEY 强度测试 ============

class TestSecretKeyStrength:
    """SECRET_KEY 强度验证测试"""

    def test_weak_key_rejected(self):
        """弱密钥应被拒绝"""
        from app.core.security import validate_secret_key_strength

        weak_keys = [
            "short",
            "alllowercasebutlongenoughbutonlyonetype",
            "ALLUPPERCASEBUTLONGENOUGHBUTONLYONETYPE",
            "12345678901234567890123456789012",
            "your-super-secret-key-change-this-in-production",
        ]
        for key in weak_keys:
            is_valid, msg = validate_secret_key_strength(key)
            assert not is_valid, f"弱密钥应被拒绝: {key[:20]}..."

    def test_strong_key_accepted(self):
        """强密钥应被接受"""
        from app.core.security import validate_secret_key_strength, generate_secure_random_string

        # 生成的随机密钥
        strong_key = generate_secure_random_string(32)
        is_valid, _ = validate_secret_key_strength(strong_key)
        assert is_valid, "生成的随机密钥应通过验证"

        # 手动构造的强密钥
        manual_key = "MyStr0ng!S3cur3tyK3yWithM4nyCh4r4ct3rs"
        is_valid, _ = validate_secret_key_strength(manual_key)
        assert is_valid, "手动构造的强密钥应通过验证"


# ============ 3. Cookie 安全测试 ============

class TestCookieSecurity:
    """HttpOnly Cookie 安全测试"""

    def test_refresh_token_has_type_claim(self):
        """Refresh Token 应包含 type=refresh 标记"""
        from app.core.cookie_security import create_refresh_token, verify_refresh_token

        token = create_refresh_token(user_id=42)
        assert token is not None

        # 验证返回正确的 user_id
        user_id = verify_refresh_token(token)
        assert user_id == 42

    def test_access_token_rejected_as_refresh(self):
        """Access Token 不能被用作 Refresh Token"""
        from app.core.cookie_security import verify_refresh_token
        from app.core.security import create_access_token

        # 创建一个 access token（没有 type=refresh 标记）
        access_token = create_access_token(data={"sub": "42"})

        # 验证应返回 None
        result = verify_refresh_token(access_token)
        assert result is None, "Access Token 不应通过 Refresh Token 验证"

    def test_invalid_token_rejected(self):
        """无效 token 应被拒绝"""
        from app.core.cookie_security import verify_refresh_token

        assert verify_refresh_token("invalid_token") is None
        assert verify_refresh_token("") is None
        assert verify_refresh_token("eyJhbGciOiJIUzI1NiJ9.invalid.signature") is None


# ============ 4. 输入验证测试 ============

class TestInputValidation:
    """输入验证和净化测试"""

    def test_html_stripping(self):
        """HTML 标签应被剥离"""
        from app.core.input_validation import strip_html_tags

        assert strip_html_tags("<script>alert(1)</script>Hello") == "alert(1)Hello"
        assert strip_html_tags("<b>Bold</b> <i>Italic</i>") == "Bold Italic"
        assert strip_html_tags("No HTML here") == "No HTML here"
        assert strip_html_tags("") == ""

    def test_path_traversal_detection(self):
        """路径遍历攻击应被检测"""
        from app.core.input_validation import detect_path_traversal

        assert detect_path_traversal("../../../etc/passwd") is True
        assert detect_path_traversal("..\\windows\\system32") is True
        assert detect_path_traversal("%2e%2e%2fetc") is True
        assert detect_path_traversal("normal_filename.txt") is False
        assert detect_path_traversal("") is False

    def test_filename_sanitization(self):
        """文件名应被净化"""
        from app.core.input_validation import sanitize_filename

        assert sanitize_filename("test.docx") == "test.docx"
        assert sanitize_filename("../../etc/passwd") == "etcpasswd"
        assert sanitize_filename("") == "untitled"
        assert sanitize_filename("normal-file_v1.0.txt") == "normal-file_v1.0.txt"

    def test_sql_injection_detection(self):
        """SQL 注入应被检测"""
        from app.core.input_validation import detect_sql_injection

        assert detect_sql_injection("1 OR 1=1") is True
        assert detect_sql_injection("'; DROP TABLE users;--") is True
        assert detect_sql_injection("hello world") is False
        assert detect_sql_injection("") is False


# ============ 5. CORS 验证测试 ============

class TestCORSValidation:
    """CORS 配置验证测试"""

    def test_valid_origins(self):
        """有效的 CORS 来源应通过验证"""
        from app.core.cors_validation import validate_cors_origins

        origins = ["https://example.com", "http://localhost:3000"]
        valid, warnings = validate_cors_origins(origins, is_debug=True)
        assert len(valid) == 2
        assert len(warnings) == 0

    def test_invalid_format_rejected(self):
        """格式错误的来源应被拒绝"""
        from app.core.cors_validation import validate_cors_origins

        origins = ["not-a-url", "ftp://wrong-scheme.com"]
        valid, warnings = validate_cors_origins(origins, is_debug=True)
        assert len(valid) == 0
        assert len(warnings) >= 2

    def test_wildcard_warning(self):
        """通配符应产生警告"""
        from app.core.cors_validation import validate_cors_origins

        valid, warnings = validate_cors_origins(["*"], is_debug=False)
        assert "*" in valid  # 通配符仍然有效，但产生警告
        assert any("通配符" in w for w in warnings)

    def test_localhost_in_production_warning(self):
        """生产环境中的 localhost 应产生警告"""
        from app.core.cors_validation import validate_cors_origins

        _, warnings = validate_cors_origins(["http://localhost:3000"], is_debug=False)
        assert any("localhost" in w for w in warnings)


# ============ 6. 密码策略测试 ============

class TestPasswordPolicy:
    """密码策略测试"""

    def _validate(self, password):
        """内联密码验证逻辑（避免导入整个 auth_service 链）"""
        if len(password) < 6:
            return False, "密码长度不能少于 6 位"
        if len(password) > 100:
            return False, "密码长度不能超过 100 位"
        if not re.match(r"^[a-zA-Z0-9!@#$%^&*()_\+\-\=]+$", password):
            return False, "密码仅允许字母、数字和常见特殊符号"
        has_lower = bool(re.search(r"[a-z]", password))
        has_upper = bool(re.search(r"[A-Z]", password))
        has_digit = bool(re.search(r"[0-9]", password))
        type_count = sum([has_lower, has_upper, has_digit])
        if type_count < 2:
            return False, "密码必须至少包含两种字符类型"
        return True, ""

    def test_valid_passwords(self):
        """有效密码应通过验证"""
        valid = ["abc123", "ABC123", "Abcdef", "Test!123", "MyP@ss=123", "a1b2c3"]
        for pwd in valid:
            is_valid, msg = self._validate(pwd)
            assert is_valid, f"'{pwd}' 应有效但返回: {msg}"

    def test_short_password_rejected(self):
        """短密码应被拒绝"""
        is_valid, _ = self._validate("12345")
        assert not is_valid

    def test_single_type_rejected(self):
        """仅一种字符类型的密码应被拒绝"""
        is_valid, _ = self._validate("abcdef")
        assert not is_valid
        is_valid, _ = self._validate("123456")
        assert not is_valid

    def test_dangerous_chars_rejected(self):
        """包含危险字符的密码应被拒绝"""
        is_valid, _ = self._validate("test<script>")
        assert not is_valid
        is_valid, _ = self._validate('test"quote')
        assert not is_valid


# ============ 7. 错误处理测试 ============

class TestErrorHandler:
    """统一错误处理测试"""

    def test_error_classes(self):
        """错误类应有正确的状态码"""
        from app.core.error_handler import (
            AppError, AuthenticationError, PermissionDeniedError,
            ResourceNotFoundError, RateLimitError,
        )

        assert AppError().status_code == 500
        assert AuthenticationError().status_code == 401
        assert PermissionDeniedError().status_code == 403
        assert ResourceNotFoundError().status_code == 404
        assert RateLimitError().status_code == 429

    def test_error_message(self):
        """错误类应有可读的消息"""
        from app.core.error_handler import AuthenticationError

        err = AuthenticationError("Token 已过期")
        assert err.message == "Token 已过期"
        assert err.error_code == "authentication_error"


# ============ 8. 安全审计日志测试 ============

class TestSecurityAudit:
    """安全审计日志测试"""

    def test_identifier_masking(self):
        """用户标识应被正确脱敏"""
        from app.core.security_audit import _mask_identifier

        assert _mask_identifier("alice@example.com") == "a***e@example.com"
        assert _mask_identifier("bob") == "b***b"
        assert _mask_identifier("a") == "a***"
        assert _mask_identifier("") == "***"
        assert _mask_identifier("longemail@domain.com") == "l***l@domain.com"

    def test_audit_functions_callable(self):
        """所有审计函数应可正常调用"""
        from app.core.security_audit import (
            log_login_success, log_login_failure,
            log_register_success, log_password_change,
            log_token_refresh_success, log_token_refresh_failure,
            log_rate_limit_hit, log_suspicious_input,
        )

        # 这些函数不应抛出异常
        log_login_success(user_id=1, ip="127.0.0.1")
        log_login_failure(identifier="test@example.com", reason="密码错误")
        log_register_success(user_id=2)
        log_password_change(user_id=1)
        log_token_refresh_success(user_id=1, source="cookie")
        log_token_refresh_failure(reason="token 过期")
        log_rate_limit_hit(ip="10.0.0.1", endpoint="/auth/login")
        log_suspicious_input(ip="10.0.0.1", field="content", attack_type="sql_injection")


# ============ 运行测试 ============

def run_all_tests():
    """运行所有安全测试"""
    test_classes = [
        TestPasswordSecurity,
        TestSecretKeyStrength,
        TestCookieSecurity,
        TestInputValidation,
        TestCORSValidation,
        TestPasswordPolicy,
        TestErrorHandler,
        TestSecurityAudit,
    ]

    total = 0
    passed = 0
    failed = 0
    errors = []

    for test_class in test_classes:
        instance = test_class()
        methods = [m for m in dir(instance) if m.startswith("test_")]

        for method_name in methods:
            total += 1
            test_name = f"{test_class.__name__}.{method_name}"
            try:
                getattr(instance, method_name)()
                passed += 1
                print(f"  ✅ {test_name}")
            except Exception as e:
                failed += 1
                errors.append((test_name, str(e)))
                print(f"  ❌ {test_name}: {e}")

    print()
    print(f"总计: {total} 个测试, {passed} 通过, {failed} 失败")

    if errors:
        print()
        print("失败的测试:")
        for name, error in errors:
            print(f"  - {name}: {error}")
        return 1

    return 0


if __name__ == "__main__":
    print("=" * 60)
    print("🔐 Mochat 安全回归测试")
    print("=" * 60)
    print()
    sys.exit(run_all_tests())
