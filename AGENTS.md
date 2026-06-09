# AGENTS.md — Mochat 项目协作规则

## PR 合并策略

- PR 必须在 **CI 全部通过** 且 **AI review 评论全部收敛（已修复或已关闭）** 后才能合并。
- 不得使用 `--admin` 等方式绕过分支保护规则。

## PR 工作流顺序

1. 提交代码并推送 PR。
2. **立即检查 AI review 评论**，优先修复 review 中指出的问题，再等 CI。原因：review 修改会触发 CI 重跑，先等 CI 再改 review 等于白等一轮。
3. review 全部收敛（已修复或 resolve）后，等待 CI 全绿。
4. CI 全绿 + review 收敛 → merge。
