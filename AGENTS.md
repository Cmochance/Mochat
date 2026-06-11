# AGENTS.md — Mochat 项目协作规则

## PR 合并策略

- PR 必须在 **CI 全部通过** 且 **AI review 评论全部收敛（已修复或已关闭）** 后才能合并。
- 不得使用 `--admin` 等方式绕过分支保护规则。

## 本地修改与工作区规则

- **工作区隔离**：本地主仓库（Main Repository Root）未忽略的文件绝对不允许直接进行本地修改。
- **Worktree 提交制**：所有的代码开发和修改均需要通过创建独立的 `git worktree` 并提交相应的工作分支来进行，最后通过 Pull Request 进行合并。

## PR 工作流顺序

1. 提交代码并推送 PR。
2. **立即检查 AI review 评论**，优先修复 review 中指出的问题，再等 CI。原因：review 修改会触发 CI 重跑，先等 CI 再改 review 等于白等一轮。
3. review 全部收敛（已修复或 resolve）后，等待 CI 全绿。
4. CI 全绿 + review 收敛 → merge。

## "merge收尾" 工作流步骤

在任何时候当用户发送“merge收尾”指令时，必须执行以下收尾工作流：
1. **确认PR状态并合并**：通过 `gh` 接口确认当前 PR 的 CI 全部通过且所有 AI review 评论已收敛（Resolved/Closed）。确认无误后执行 `gh pr merge --merge` 进行合并。
2. **确认远端分支关闭**：确认远端对应的工作分支已被关闭并删除，若未删除则予以清理。
3. **本地拉取更新**：切换回本地主仓库的 `main` 分支，执行 `git pull` 拉取远端合并后的最新更新。
4. **清理本地 Worktree**：检查并删除刚才任务涉及且工作已结束的本地 Git worktree。若有工作未完成的 worktree 需暂留，并向用户做详细进展汇报。
