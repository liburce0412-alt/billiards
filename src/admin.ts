import { apiJson, isLocalDemo, type PlatformMe } from "./platform/api"
import {
  avatarElement,
  emptyState,
  mountPlatformPage,
  toast,
} from "./platform/page"
import { platformGate } from "./platform/shell"

type Counts = {
  users: number
  pending: number
  reports: number
  active_rooms: number
}
type PendingUser = {
  id: string
  username: string
  email: string
  display_name: string
  created_at: number
}
type AdminUser = PendingUser & {
  role: "user" | "moderator" | "admin"
  approval_status: "pending" | "approved" | "rejected" | "revoked"
  visibility: string
  avatar_key: string | null
  muted_until: number | null
  banned_until: number | null
  approval_note: string | null
  createdAt: number
}
type Report = {
  id: string
  reporter_name: string
  target_name: string | null
  reason: string
  details: string
  status: string
  created_at: number
}
type Announcement = {
  id: string
  title: string
  body: string
  active_from: number
  active_until: number | null
  created_at: number
}
type Audit = {
  id: string
  actor_name: string | null
  action: string
  target_type: string
  target_id: string | null
  metadata_json: string
  created_at: number
}

class AdminPage {
  private counts: Counts = { users: 0, pending: 0, reports: 0, active_rooms: 0 }
  private pending: PendingUser[] = []
  private users: AdminUser[] = []
  private reports: Report[] = []
  private announcements: Announcement[] = []
  private audits: Audit[] = []

  constructor(
    private readonly session: PlatformMe,
    private readonly root: HTMLElement
  ) {}

  async init() {
    if (!this.session.capabilities.admin) {
      this.root.append(
        emptyState(
          "ph-shield-warning",
          "没有管理权限",
          "此页面只允许服务端角色为版主或管理员的账号访问。"
        )
      )
      return
    }
    this.root.innerHTML = `
      <div class="admin-layout">
        <aside class="platform-panel admin-rail">
          <header><span class="admin-rail__mark"><i class="ph ph-shield-checkered"></i></span><div><strong>控制中心</strong><small id="adminRoleLabel"></small></div></header>
          <nav aria-label="管理功能">
            <button type="button" data-admin-section="overview" aria-current="page"><i class="ph ph-squares-four"></i><span>概览</span></button>
            <button type="button" data-admin-section="approvals"><i class="ph ph-user-check"></i><span>注册审核</span><b id="adminPendingBadge">0</b></button>
            <button type="button" data-admin-section="users"><i class="ph ph-users"></i><span>用户治理</span></button>
            <button type="button" data-admin-section="reports"><i class="ph ph-flag"></i><span>举报处理</span><b id="adminReportBadge">0</b></button>
            <button type="button" data-admin-section="announcements"><i class="ph ph-megaphone"></i><span>公告</span></button>
            <button type="button" data-admin-section="audit"><i class="ph ph-scroll"></i><span>审计日志</span></button>
          </nav>
          <p><i class="ph ph-lock-key"></i> 所有管理操作均在服务端校验角色并写入审计。</p>
        </aside>

        <div class="admin-content">
          <section data-admin-panel="overview">
            <div id="adminMetrics" class="admin-metrics"></div>
            <div class="admin-overview-grid">
              <section class="platform-panel">
                <header class="platform-panel__header"><div><h2>优先审核</h2><p>最早提交的注册申请</p></div><button class="platform-soft-button" type="button" data-jump="approvals">查看全部</button></header>
                <div id="adminPendingPreview" class="platform-panel__body"></div>
              </section>
              <section class="platform-panel">
                <header class="platform-panel__header"><div><h2>待处理举报</h2><p>按提交时间排序</p></div><button class="platform-soft-button" type="button" data-jump="reports">查看全部</button></header>
                <div id="adminReportPreview" class="platform-panel__body"></div>
              </section>
            </div>
          </section>

          <section data-admin-panel="approvals" hidden>
            <div class="platform-panel">
              <header class="platform-panel__header"><div><h2>注册审核队列</h2><p>通过后即时开放在线模式、好友、聊天与邀请</p></div><button id="adminRefreshApprovals" class="platform-soft-button" type="button"><i class="ph ph-arrows-clockwise"></i>刷新</button></header>
              <div id="adminApprovalList" class="admin-card-list platform-panel__body"></div>
            </div>
          </section>

          <section data-admin-panel="users" hidden>
            <div class="platform-panel">
              <header class="platform-panel__header admin-users-header"><div><h2>用户治理</h2><p>审核状态、角色、禁言、封禁与头像处理</p></div><div class="admin-user-filters"><div class="platform-search"><i class="ph ph-magnifying-glass"></i><input id="adminUserSearch" type="search" placeholder="用户名、邮箱或显示名" /></div><select id="adminUserStatus"><option value="">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已拒绝</option><option value="revoked">已撤销</option></select></div></header>
              <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>用户</th><th>审核</th><th>角色</th><th>制裁</th><th>操作</th></tr></thead><tbody id="adminUsersBody"></tbody></table></div>
            </div>
          </section>

          <section data-admin-panel="reports" hidden>
            <div class="platform-panel">
              <header class="platform-panel__header"><div><h2>举报处理</h2><p>举报内容仅管理员与版主可见</p></div></header>
              <div id="adminReportList" class="admin-card-list platform-panel__body"></div>
            </div>
          </section>

          <section data-admin-panel="announcements" hidden>
            <div class="admin-announcement-grid">
              <form id="adminAnnouncementForm" class="platform-panel account-form">
                <header class="platform-panel__header"><div><h2>发布公告</h2><p>公告会出现在登录用户首页</p></div><i class="ph ph-megaphone account-section-icon"></i></header>
                <div class="platform-panel__body admin-form-stack">
                  <label class="platform-field"><span>标题</span><input name="title" minlength="2" maxlength="80" required /></label>
                  <label class="platform-field"><span>正文</span><textarea name="body" minlength="2" maxlength="2000" rows="7" required></textarea></label>
                  <label class="platform-field"><span>自动下线时间（可选）</span><input name="activeUntil" type="datetime-local" /></label>
                  <button class="platform-primary" type="submit"><span>发布公告</span><i class="ph ph-paper-plane-tilt"></i></button>
                </div>
              </form>
              <section class="platform-panel"><header class="platform-panel__header"><div><h2>历史公告</h2><p>最近 50 条</p></div></header><div id="adminAnnouncementList" class="admin-card-list platform-panel__body"></div></section>
            </div>
          </section>

          <section data-admin-panel="audit" hidden>
            <div class="platform-panel">
              <header class="platform-panel__header"><div><h2>追加式审计日志</h2><p>角色变更、审核、封禁、公告与账号恢复均记录</p></div><button id="adminRefreshAudit" class="platform-soft-button" type="button"><i class="ph ph-arrows-clockwise"></i>刷新</button></header>
              <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>详情</th></tr></thead><tbody id="adminAuditBody"></tbody></table></div>
            </div>
          </section>
        </div>
      </div>`
    this.bind()
    await this.loadOverview()
    await this.loadUsers()
    if (this.session.user.role === "admin") await this.loadAudit()
    this.renderAll()
  }

  private bind() {
    this.root.querySelector<HTMLElement>("#adminRoleLabel")!.textContent =
      this.session.user.role === "admin" ? "管理员" : "版主"
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-admin-section]"
    )) {
      button.onclick = () => this.setSection(button.dataset.adminSection!)
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-jump]"
    )) {
      button.onclick = () => this.setSection(button.dataset.jump!)
    }
    this.root.querySelector<HTMLButtonElement>(
      "#adminRefreshApprovals"
    )!.onclick = () => void this.refresh()
    this.root.querySelector<HTMLButtonElement>("#adminRefreshAudit")!.onclick =
      () => void this.loadAudit().then(() => this.renderAudit())
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null
    const search =
      this.root.querySelector<HTMLInputElement>("#adminUserSearch")!
    const status =
      this.root.querySelector<HTMLSelectElement>("#adminUserStatus")!
    const update = () => {
      if (timer) clearTimeout(timer)
      timer = globalThis.setTimeout(
        () =>
          void this.loadUsers(search.value, status.value).then(() =>
            this.renderUsers()
          ),
        220
      )
    }
    search.oninput = update
    status.onchange = update
    this.root.querySelector<HTMLFormElement>(
      "#adminAnnouncementForm"
    )!.onsubmit = (event) => {
      event.preventDefault()
      void this.createAnnouncement(event.currentTarget as HTMLFormElement)
    }
  }

  private async loadOverview() {
    if (isLocalDemo()) {
      this.counts = { users: 128, pending: 3, reports: 2, active_rooms: 7 }
      this.pending = demoUsers().slice(0, 3)
      this.reports = [
        {
          id: crypto.randomUUID(),
          reporter_name: "月影长河",
          target_name: "测试球员",
          reason: "不当言论",
          details: "房间聊天中持续骚扰",
          status: "open",
          created_at: Date.now() - 3600_000,
        },
      ]
      this.announcements = [
        {
          id: crypto.randomUUID(),
          title: "欢迎来到 Break Builder",
          body: "所有外观免费；友善交流，享受每一杆。",
          active_from: Date.now(),
          active_until: null,
          created_at: Date.now(),
        },
      ]
      return
    }
    const result = await apiJson<{
      counts: Counts
      pending: PendingUser[]
      reports: Report[]
      announcements: Announcement[]
    }>("/api/admin/overview")
    this.counts = result.counts
    this.pending = result.pending
    this.reports = result.reports
    this.announcements = result.announcements
  }

  private async loadUsers(query = "", status = "") {
    this.users = isLocalDemo()
      ? demoUsers()
      : (
          await apiJson<{ users: AdminUser[] }>(
            `/api/admin/users?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`
          )
        ).users
  }

  private async loadAudit() {
    if (this.session.user.role !== "admin") return
    this.audits = isLocalDemo()
      ? [
          {
            id: crypto.randomUUID(),
            actor_name: this.session.user.displayName,
            action: "admin.bootstrap",
            target_type: "user",
            target_id: this.session.user.id,
            metadata_json: "{}",
            created_at: Date.now() - 86_400_000,
          },
        ]
      : (await apiJson<{ logs: Audit[] }>("/api/admin/audit")).logs
  }

  private renderAll() {
    this.renderMetrics()
    this.renderApprovalLists()
    this.renderUsers()
    this.renderReports()
    this.renderAnnouncements()
    this.renderAudit()
  }

  private renderMetrics() {
    const root = this.root.querySelector<HTMLElement>("#adminMetrics")!
    root.replaceChildren()
    const items: Array<[keyof Counts, string, string, string]> = [
      ["users", "总用户", "ph-users", "累计注册账号"],
      ["pending", "待审核", "ph-user-check", "需要你的决定"],
      ["reports", "待处理举报", "ph-flag", "开放或处理中"],
      ["active_rooms", "进行中房间", "ph-broadcast", "实时对局"],
    ]
    for (const [key, label, icon, detail] of items) {
      const card = document.createElement("article")
      card.className = "platform-panel admin-metric"
      const top = document.createElement("div")
      const item = document.createElement("i")
      item.className = `ph ${icon}`
      const value = document.createElement("strong")
      value.textContent = String(this.counts[key] ?? 0)
      top.append(item, value)
      const title = document.createElement("span")
      title.textContent = label
      const small = document.createElement("small")
      small.textContent = detail
      card.append(top, title, small)
      root.append(card)
    }
    this.root.querySelector<HTMLElement>("#adminPendingBadge")!.textContent =
      String(this.counts.pending)
    this.root.querySelector<HTMLElement>("#adminReportBadge")!.textContent =
      String(this.counts.reports)
  }

  private renderApprovalLists() {
    this.renderPendingInto(
      this.root.querySelector<HTMLElement>("#adminPendingPreview")!,
      this.pending.slice(0, 4),
      true
    )
    this.renderPendingInto(
      this.root.querySelector<HTMLElement>("#adminApprovalList")!,
      this.pending,
      false
    )
  }

  private renderPendingInto(
    root: HTMLElement,
    users: PendingUser[],
    compact: boolean
  ) {
    root.replaceChildren()
    if (!users.length) {
      root.append(
        emptyState(
          "ph-check-circle",
          "审核队列已清空",
          "新的注册账号会自动排到这里。"
        )
      )
      return
    }
    const list = document.createElement("div")
    list.className = compact ? "admin-compact-list" : "admin-card-list"
    for (const user of users) {
      const card = document.createElement("article")
      card.className = compact ? "admin-compact-user" : "admin-approval-card"
      card.append(avatarElement(user.display_name, null, compact ? "sm" : "md"))
      const copy = document.createElement("div")
      copy.className = "admin-user-copy"
      const name = document.createElement("strong")
      name.textContent = user.display_name
      const username = document.createElement("span")
      username.textContent = `@${user.username}`
      const email = document.createElement("small")
      email.textContent = user.email
      copy.append(name, username, email)
      const actions = document.createElement("div")
      actions.className = "platform-button-row"
      const approve = actionButton("ph-check", "通过", "approve")
      approve.onclick = () => void this.setApproval(user.id, "approved")
      const reject = actionButton("ph-x", "拒绝", "reject")
      reject.onclick = () => void this.setApproval(user.id, "rejected")
      actions.append(approve, reject)
      card.append(copy, actions)
      list.append(card)
    }
    root.append(list)
  }

  private renderUsers() {
    const body = this.root.querySelector<HTMLElement>("#adminUsersBody")!
    body.replaceChildren()
    for (const user of this.users) {
      const row = document.createElement("tr")
      const identity = document.createElement("td")
      const wrap = document.createElement("div")
      wrap.className = "admin-table-user"
      wrap.append(
        avatarElement(
          user.display_name,
          user.avatar_key ? `/media/avatar/${user.id}` : null,
          "sm"
        )
      )
      const copy = document.createElement("div")
      const name = document.createElement("strong")
      name.textContent = user.display_name
      const meta = document.createElement("small")
      meta.textContent = `@${user.username} · ${user.email}`
      copy.append(name, meta)
      wrap.append(copy)
      identity.append(wrap)
      const approval = document.createElement("td")
      approval.append(statusBadge(user.approval_status))
      const role = document.createElement("td")
      const select = document.createElement("select")
      select.className = "admin-inline-select"
      for (const value of ["user", "moderator", "admin"] as const) {
        const option = document.createElement("option")
        option.value = value
        option.textContent = {
          user: "球员",
          moderator: "版主",
          admin: "管理员",
        }[value]
        option.selected = user.role === value
        select.append(option)
      }
      select.disabled =
        this.session.user.role !== "admin" || user.id === this.session.user.id
      select.onchange = () => void this.setRole(user.id, select.value)
      role.append(select)
      const sanction = document.createElement("td")
      sanction.textContent = sanctionLabel(user)
      const actions = document.createElement("td")
      const menu = document.createElement("div")
      menu.className = "platform-button-row admin-row-actions"
      const approve = iconAction("ph-check", "批准在线")
      approve.onclick = () => void this.setApproval(user.id, "approved")
      const revoke = iconAction("ph-plugs-connected-x", "撤销在线")
      revoke.onclick = () => void this.setApproval(user.id, "revoked")
      const mute = iconAction("ph-speaker-slash", "禁言")
      mute.onclick = () => void this.sanction(user.id, "mute")
      const ban = iconAction("ph-prohibit", "封禁")
      ban.onclick = () => void this.sanction(user.id, "ban")
      const clear = iconAction("ph-eraser", "解除制裁")
      clear.onclick = () => void this.clearSanctions(user.id)
      const avatar = iconAction("ph-user-minus", "移除头像")
      avatar.onclick = () => void this.removeAvatar(user.id)
      menu.append(approve, revoke, mute, ban, clear, avatar)
      actions.append(menu)
      row.append(identity, approval, role, sanction, actions)
      body.append(row)
    }
  }

  private renderReports() {
    const preview = this.root.querySelector<HTMLElement>("#adminReportPreview")!
    const full = this.root.querySelector<HTMLElement>("#adminReportList")!
    this.renderReportInto(preview, this.reports.slice(0, 4), true)
    this.renderReportInto(full, this.reports, false)
  }

  private renderReportInto(
    root: HTMLElement,
    reports: Report[],
    compact: boolean
  ) {
    root.replaceChildren()
    if (!reports.length) {
      root.append(
        emptyState(
          "ph-shield-check",
          "暂无待处理举报",
          "处理完成的举报不会显示在待办中。"
        )
      )
      return
    }
    for (const report of reports) {
      const card = reportCard(report, compact)
      if (!compact) {
        const actions = document.createElement("div")
        actions.className = "platform-button-row"
        const options = [
          ["reviewing", "开始处理", "ph-eye"],
          ["resolved", "标记解决", "ph-check"],
          ["dismissed", "驳回举报", "ph-x"],
        ] as const
        for (const [status, label, icon] of options) {
          const button = actionButton(icon, label)
          button.onclick = () => void this.updateReport(report.id, status)
          actions.append(button)
        }
        card.append(actions)
      }
      root.append(card)
    }
  }

  private renderAnnouncements() {
    const root = this.root.querySelector<HTMLElement>("#adminAnnouncementList")!
    root.replaceChildren()
    if (!this.announcements.length) {
      root.append(
        emptyState("ph-megaphone", "还没有公告", "发布一条欢迎或维护公告。")
      )
      return
    }
    for (const announcement of this.announcements) {
      const card = document.createElement("article")
      card.className = "admin-announcement-card"
      const title = document.createElement("strong")
      title.textContent = announcement.title
      const body = document.createElement("p")
      body.textContent = announcement.body
      const meta = document.createElement("small")
      meta.textContent = new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(announcement.created_at)
      card.append(title, body, meta)
      root.append(card)
    }
  }

  private renderAudit() {
    const body = this.root.querySelector<HTMLElement>("#adminAuditBody")!
    body.replaceChildren()
    if (this.session.user.role !== "admin") {
      const row = document.createElement("tr")
      const cell = document.createElement("td")
      cell.colSpan = 5
      cell.append(
        emptyState(
          "ph-lock-key",
          "仅管理员可查看",
          "版主可以处理审核和举报，但不能查看完整审计日志。"
        )
      )
      row.append(cell)
      body.append(row)
      return
    }
    for (const audit of this.audits) {
      const row = document.createElement("tr")
      const target = audit.target_id
        ? `${audit.target_type} / ${audit.target_id.slice(0, 8)}`
        : audit.target_type
      for (const value of [
        new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "short",
          timeStyle: "medium",
        }).format(audit.created_at),
        audit.actor_name ?? "系统",
        audit.action,
        target,
        audit.metadata_json,
      ]) {
        const cell = document.createElement("td")
        cell.textContent = value
        row.append(cell)
      }
      body.append(row)
    }
  }

  private setSection(section: string) {
    for (const panel of this.root.querySelectorAll<HTMLElement>(
      "[data-admin-panel]"
    ))
      panel.hidden = panel.dataset.adminPanel !== section
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-admin-section]"
    )) {
      if (button.dataset.adminSection === section)
        button.setAttribute("aria-current", "page")
      else button.removeAttribute("aria-current")
    }
  }

  private async refresh() {
    await Promise.all([this.loadOverview(), this.loadUsers(), this.loadAudit()])
    this.renderAll()
    toast("管理数据已刷新", "success")
  }

  private async setApproval(
    userId: string,
    status: "approved" | "rejected" | "revoked"
  ) {
    const promptByStatus = {
      rejected: "请输入拒绝原因",
      revoked: "请输入撤销在线权限的原因",
    } as const
    const note =
      status === "approved"
        ? "管理员审核通过"
        : globalThis.prompt(promptByStatus[status])?.trim()
    if (status !== "approved" && !note) return
    try {
      if (!isLocalDemo())
        await apiJson(`/api/admin/users/${userId}/approval`, {
          method: "PATCH",
          body: JSON.stringify({ status, note }),
        })
      toast(
        status === "approved" ? "在线权限已开启" : "账号状态已更新",
        "success"
      )
      await this.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : "审核操作失败", "error")
    }
  }

  private async sanction(userId: string, type: "mute" | "ban") {
    const reason = globalThis
      .prompt(`请输入${type === "ban" ? "封禁" : "禁言"}原因`)
      ?.trim()
    if (!reason) return
    const raw =
      globalThis.prompt("持续分钟数；留空表示永久", "60")?.trim() ?? ""
    const durationMinutes = raw ? Number(raw) : null
    if (
      durationMinutes !== null &&
      (!Number.isFinite(durationMinutes) || durationMinutes < 1)
    ) {
      toast("持续时间必须是正整数分钟", "error")
      return
    }
    try {
      if (!isLocalDemo())
        await apiJson(`/api/admin/users/${userId}/sanctions`, {
          method: "POST",
          body: JSON.stringify({ type, reason, durationMinutes }),
        })
      toast(type === "ban" ? "账号已封禁并断开会话" : "账号已禁言", "success")
      await this.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : "制裁操作失败", "error")
    }
  }

  private async clearSanctions(userId: string) {
    if (!globalThis.confirm("解除这个账号的全部当前制裁？")) return
    if (!isLocalDemo())
      await apiJson(`/api/admin/users/${userId}/sanctions`, {
        method: "DELETE",
      })
    toast("制裁已解除", "success")
    await this.refresh()
  }

  private async setRole(userId: string, role: string) {
    if (!globalThis.confirm(`确认将角色改为 ${role}？`)) return
    try {
      if (!isLocalDemo())
        await apiJson(`/api/admin/users/${userId}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        })
      toast("角色已更新", "success")
      await this.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : "角色更新失败", "error")
    }
  }

  private async removeAvatar(userId: string) {
    if (!globalThis.confirm("移除该用户的当前头像？")) return
    if (!isLocalDemo())
      await apiJson(`/api/admin/users/${userId}/avatar`, { method: "DELETE" })
    toast("头像已移除", "success")
    await this.refresh()
  }

  private async updateReport(
    reportId: string,
    status: "reviewing" | "resolved" | "dismissed"
  ) {
    if (!isLocalDemo())
      await apiJson(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
    toast("举报状态已更新", "success")
    await this.refresh()
  }

  private async createAnnouncement(form: HTMLFormElement) {
    const data = new FormData(form)
    const until = String(data.get("activeUntil") ?? "")
    try {
      if (!isLocalDemo()) {
        await apiJson("/api/admin/announcements", {
          method: "POST",
          body: JSON.stringify({
            title: data.get("title"),
            body: data.get("body"),
            activeUntil: until ? new Date(until).getTime() : null,
          }),
        })
      }
      form.reset()
      toast("公告已发布", "success")
      await this.refresh()
    } catch (error) {
      toast(error instanceof Error ? error.message : "公告发布失败", "error")
    }
  }
}

function actionButton(icon: string, label: string, kind = "") {
  const button = document.createElement("button")
  button.type = "button"
  button.className =
    kind === "reject" ? "platform-danger-button" : "platform-soft-button"
  const item = document.createElement("i")
  item.className = `ph ${icon}`
  const text = document.createElement("span")
  text.textContent = label
  button.append(item, text)
  return button
}

function iconAction(icon: string, label: string) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "platform-icon-button"
  button.title = label
  button.setAttribute("aria-label", label)
  const item = document.createElement("i")
  item.className = `ph ${icon}`
  button.append(item)
  return button
}

function statusBadge(status: string) {
  const badge = document.createElement("span")
  badge.className = "admin-status-badge"
  badge.dataset.state = status
  badge.textContent =
    (
      {
        pending: "待审核",
        approved: "已通过",
        rejected: "已拒绝",
        revoked: "已撤销",
        open: "待处理",
        reviewing: "处理中",
        resolved: "已解决",
        dismissed: "已驳回",
      } as Record<string, string>
    )[status] ?? status
  return badge
}

function sanctionLabel(user: AdminUser) {
  const now = Date.now()
  if (user.banned_until && user.banned_until > now) return "已封禁"
  if (user.muted_until && user.muted_until > now) return "已禁言"
  return "正常"
}

function reportCard(report: Report, compact: boolean) {
  const card = document.createElement("article")
  card.className = compact ? "admin-report-compact" : "admin-report-card"
  const header = document.createElement("header")
  const title = document.createElement("strong")
  title.textContent = report.reason
  header.append(title, statusBadge(report.status))
  const meta = document.createElement("small")
  const targetName = report.target_name ?? "消息"
  meta.textContent = `${report.reporter_name} 举报 ${targetName} · ${relativeTime(report.created_at)}`
  const details = document.createElement("p")
  details.textContent = report.details
  card.append(header, meta, details)
  return card
}

function relativeTime(timestamp: number) {
  const minutes = Math.round((Date.now() - timestamp) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.round(hours / 24)} 天前`
}

function demoUsers(): AdminUser[] {
  const names = [
    ["测试球员", "testplayer", "pending"],
    ["星海漫游者", "starwalker", "approved"],
    ["风继续吹", "windblows", "approved"],
    ["月影长河", "moonriver", "approved"],
    ["临界点", "critical", "revoked"],
  ] as const
  return names.map(([displayName, username, approval], index) => ({
    id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    display_name: displayName,
    username,
    email: `${username}@example.com`,
    created_at: Date.now() - index * 3600_000,
    createdAt: Date.now() - index * 3600_000,
    role: "user",
    approval_status: approval,
    visibility: index % 2 ? "online" : "away",
    avatar_key: null,
    muted_until: null,
    banned_until: null,
    approval_note: null,
  }))
}

async function bootstrap() {
  const session = await platformGate()
  if (!session) return
  const root = mountPlatformPage(
    session,
    "admin",
    "管理控制中心",
    "审核注册、管理在线权限、处理举报并保留每一次管理操作的审计轨迹。"
  )
  await new AdminPage(session, root).init()
}

void bootstrap().catch((error) =>
  toast(error instanceof Error ? error.message : "管理后台加载失败", "error")
)
