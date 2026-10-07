import { apiJson, isLocalDemo, type PlatformMe } from "./platform/api"
import {
  avatarElement,
  emptyState,
  mountPlatformPage,
  toast,
} from "./platform/page"
import { platformGate } from "./platform/shell"
import {
  buildGameUrl,
  type LauncherSelection,
  type RoomLaunchDescriptor,
  type AnyRoomLaunchDescriptor,
  tableTennisRoomUrl,
} from "./launcherconfig"
import { renderQualityModeForPreference } from "./view/renderquality"

type SocialUser = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  accent?: string
}

type FriendRequest = {
  id: string
  sender_id: string
  receiver_id: string
  username: string
  display_name: string
  avatar_key: string | null
  created_at: number
}

type Conversation = {
  id: string
  kind: "direct" | "room"
  room_id: string | null
  other_user_id: string | null
  other_name: string | null
  other_avatar: string | null
  last_message_body: string | null
  last_message_at: number | null
}

type ChatMessage = {
  id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: number
}

type Invite = {
  id: string
  challenger_id: string
  challengee_id: string
  challenger_name: string
  challengee_name: string
  room_id: string
  room_code: string
  rule_type: string
  game_type?: "billiards" | "table-tennis"
  expires_at: number
}

type Presence = {
  userId: string
  displayName: string
  avatarUrl: string | null
  visibility: "online" | "away" | "dnd" | "invisible"
  invisible?: boolean
}

class SocialPage {
  private friends: SocialUser[] = []
  private requests: FriendRequest[] = []
  private conversations: Conversation[] = []
  private invites: Invite[] = []
  private presence = new Map<string, Presence>()
  private selectedConversation: Conversation | null = null
  private messages: ChatMessage[] = []
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private mobileView: "friends" | "chat" | "activity" = "friends"

  constructor(
    private readonly session: PlatformMe,
    private readonly root: HTMLElement
  ) {}

  async init() {
    this.root.innerHTML = `
      <div class="social-mobile-tabs" role="tablist" aria-label="社交页面区域">
        <button type="button" data-social-view="friends" aria-selected="true"><i class="ph ph-users"></i>好友</button>
        <button type="button" data-social-view="chat" aria-selected="false"><i class="ph ph-chats"></i>消息</button>
        <button type="button" data-social-view="activity" aria-selected="false"><i class="ph ph-bell"></i>动态</button>
      </div>
      <div class="social-layout">
        <aside class="platform-panel social-people" data-social-pane="friends">
          <header class="platform-panel__header">
            <div><h2>好友</h2><p id="socialFriendMeta">正在同步</p></div>
            <button id="socialAddFriend" class="platform-icon-button" type="button" aria-label="搜索并添加好友"><i class="ph ph-user-plus"></i></button>
          </header>
          <div class="social-me">
            <div id="socialMeAvatar"></div>
            <div class="social-me__copy"><strong></strong><small></small></div>
            <label class="social-visibility">
              <span class="sr-only">在线可见性</span>
              <select id="socialVisibility">
                <option value="online">在线</option>
                <option value="away">暂离</option>
                <option value="dnd">勿扰</option>
                <option value="invisible">隐身</option>
              </select>
            </label>
          </div>
          <div class="social-search-wrap" hidden>
            <div class="platform-search"><i class="ph ph-magnifying-glass"></i><input id="socialUserSearch" type="search" placeholder="搜索用户名或显示名" maxlength="40" /></div>
            <div id="socialSearchResults"></div>
          </div>
          <div class="social-section-heading"><span>我的好友</span><span id="socialOnlineCount">0 在线</span></div>
          <ul id="socialFriends" class="platform-list social-scroll"></ul>
        </aside>

        <section class="platform-panel social-chat" data-social-pane="chat">
          <header class="platform-panel__header social-chat__header">
            <div><h2 id="socialChatTitle">选择一位好友</h2><p id="socialChatMeta">私聊仅双方可见 · 保留 30 天</p></div>
            <div class="platform-button-row">
              <button id="socialInviteCurrent" class="platform-soft-button" type="button" hidden><i class="ph ph-sword"></i>邀请比赛</button>
              <button id="socialReportCurrent" class="platform-icon-button" type="button" aria-label="举报用户" hidden><i class="ph ph-flag"></i></button>
            </div>
          </header>
          <div id="socialMessages" class="social-messages"></div>
          <form id="socialComposer" class="platform-chat-composer" hidden>
            <textarea id="socialMessageInput" maxlength="1000" rows="1" placeholder="输入消息…" aria-label="私聊消息"></textarea>
            <button class="platform-primary" type="submit" aria-label="发送消息"><i class="ph ph-paper-plane-tilt"></i><span>发送</span></button>
          </form>
        </section>

        <aside class="social-activity" data-social-pane="activity">
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>实时在线</h2><p>隐身用户不会出现在这里</p></div><span id="socialVisibleCount" class="social-count-pill">0</span></header>
            <ul id="socialPresence" class="platform-list platform-panel__body social-presence"></ul>
          </section>
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>好友申请</h2><p>接受后即可私聊与邀请</p></div></header>
            <div id="socialRequests" class="platform-panel__body"></div>
          </section>
          <section class="platform-panel">
            <header class="platform-panel__header"><div><h2>比赛邀请</h2><p>邀请最长保留 10 分钟</p></div></header>
            <div id="socialInvites" class="platform-panel__body"></div>
          </section>
          <section class="platform-panel social-conversations-panel">
            <header class="platform-panel__header"><div><h2>最近消息</h2><p>点击继续对话</p></div></header>
            <ul id="socialConversations" class="platform-list platform-panel__body"></ul>
          </section>
        </aside>
      </div>`
    this.bindStaticEvents()
    this.renderMe()
    if (!this.session.capabilities.social) {
      this.renderLocked()
      return
    }
    await this.loadAll()
    this.connect()
  }

  private bindStaticEvents() {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-social-view]"
    )) {
      button.addEventListener("click", () =>
        this.setMobileView(button.dataset.socialView as typeof this.mobileView)
      )
    }
    this.root.querySelector<HTMLButtonElement>("#socialAddFriend")!.onclick =
      () => {
        const wrap = this.root.querySelector<HTMLElement>(
          ".social-search-wrap"
        )!
        wrap.hidden = !wrap.hidden
        if (!wrap.hidden)
          this.root
            .querySelector<HTMLInputElement>("#socialUserSearch")!
            .focus()
      }
    let searchTimer: ReturnType<typeof globalThis.setTimeout> | null = null
    this.root.querySelector<HTMLInputElement>("#socialUserSearch")!.oninput = (
      event
    ) => {
      if (searchTimer) clearTimeout(searchTimer)
      const query = (event.currentTarget as HTMLInputElement).value.trim()
      searchTimer = globalThis.setTimeout(
        () => void this.searchUsers(query),
        250
      )
    }
    this.root.querySelector<HTMLSelectElement>("#socialVisibility")!.onchange =
      (event) => {
        const visibility = (event.currentTarget as HTMLSelectElement).value
        void this.updateVisibility(visibility)
      }
    this.root.querySelector<HTMLFormElement>("#socialComposer")!.onsubmit = (
      event
    ) => {
      event.preventDefault()
      this.sendMessage()
    }
    this.root.querySelector<HTMLTextAreaElement>(
      "#socialMessageInput"
    )!.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault()
        this.sendMessage()
      }
    }
    this.root.querySelector<HTMLButtonElement>(
      "#socialInviteCurrent"
    )!.onclick = () => void this.inviteSelected()
    this.root.querySelector<HTMLButtonElement>(
      "#socialReportCurrent"
    )!.onclick = () => void this.reportSelected()
  }

  private renderMe() {
    const holder = this.root.querySelector<HTMLElement>("#socialMeAvatar")!
    holder.replaceChildren(
      avatarElement(
        this.session.user.displayName,
        this.session.user.avatarUrl,
        "md"
      )
    )
    this.root.querySelector<HTMLElement>(
      ".social-me__copy strong"
    )!.textContent = this.session.user.displayName
    this.root.querySelector<HTMLElement>(
      ".social-me__copy small"
    )!.textContent = `@${this.session.user.username}`
    this.root.querySelector<HTMLSelectElement>("#socialVisibility")!.value =
      this.session.user.visibility
  }

  private renderLocked() {
    const reason = `当前状态：${this.session.user.approvalStatus}。管理员通过注册审核后，好友、聊天、邀请与在线列表会自动开启。`
    this.root.querySelector<HTMLElement>("#socialFriendMeta")!.textContent =
      "在线权限尚未开启"
    this.root
      .querySelector<HTMLElement>("#socialFriends")!
      .replaceChildren(emptyState("ph-lock-key", "仅离线模式", reason))
    this.root
      .querySelector<HTMLElement>("#socialMessages")!
      .replaceChildren(
        emptyState(
          "ph-hourglass",
          "等待管理员审核",
          "审核前仍可返回首页使用练习、AI 和同屏双人。"
        )
      )
    this.root.querySelector<HTMLButtonElement>("#socialAddFriend")!.disabled =
      true
    this.root.querySelector<HTMLSelectElement>("#socialVisibility")!.disabled =
      true
  }

  private async loadAll() {
    if (isLocalDemo()) {
      this.loadDemo()
      this.renderAll()
      return
    }
    const [friends, conversations, invites] = await Promise.all([
      apiJson<{ friends: SocialUser[]; requests: FriendRequest[] }>(
        "/api/social/friends"
      ),
      apiJson<{ conversations: Conversation[] }>("/api/social/conversations"),
      apiJson<{ invites: Invite[] }>("/api/invites"),
    ])
    this.friends = friends.friends
    this.requests = friends.requests
    this.conversations = conversations.conversations
    this.invites = invites.invites
    this.renderAll()
  }

  private loadDemo() {
    this.friends = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        username: "moonriver",
        displayName: "月影长河",
        avatarUrl: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000002",
        username: "orbit",
        displayName: "极光轨迹",
        avatarUrl: null,
      },
      {
        id: "10000000-0000-4000-8000-000000000003",
        username: "wind",
        displayName: "风之诗人",
        avatarUrl: null,
      },
    ]
    this.presence = new Map([
      [
        this.friends[0].id,
        {
          userId: this.friends[0].id,
          displayName: this.friends[0].displayName,
          avatarUrl: null,
          visibility: "online",
        },
      ],
      [
        this.friends[1].id,
        {
          userId: this.friends[1].id,
          displayName: this.friends[1].displayName,
          avatarUrl: null,
          visibility: "dnd",
        },
      ],
      [
        this.session.user.id,
        {
          userId: this.session.user.id,
          displayName: this.session.user.displayName,
          avatarUrl: null,
          visibility: "online",
        },
      ],
    ])
    this.conversations = [
      {
        id: "20000000-0000-4000-8000-000000000001",
        kind: "direct",
        room_id: null,
        other_user_id: this.friends[0].id,
        other_name: this.friends[0].displayName,
        other_avatar: null,
        last_message_body: "今晚一起打一局？",
        last_message_at: Date.now() - 60_000,
      },
    ]
    this.requests = [
      {
        id: "30000000-0000-4000-8000-000000000001",
        sender_id: this.friends[2].id,
        receiver_id: this.session.user.id,
        username: this.friends[2].username,
        display_name: this.friends[2].displayName,
        avatar_key: null,
        created_at: Date.now() - 120_000,
      },
    ]
  }

  private renderAll() {
    this.renderFriends()
    this.renderPresence()
    this.renderRequests()
    this.renderInvites()
    this.renderConversations()
    if (!this.selectedConversation) this.renderChatEmpty()
  }

  private renderFriends() {
    const list = this.root.querySelector<HTMLElement>("#socialFriends")!
    list.replaceChildren()
    const online = this.friends.filter((friend) =>
      this.presence.has(friend.id)
    ).length
    this.root.querySelector<HTMLElement>("#socialFriendMeta")!.textContent =
      `${this.friends.length} 位好友`
    this.root.querySelector<HTMLElement>("#socialOnlineCount")!.textContent =
      `${online} 在线`
    if (!this.friends.length) {
      list.append(
        emptyState(
          "ph-user-plus",
          "还没有好友",
          "搜索准确用户名或显示名，发送第一份好友申请。"
        )
      )
      return
    }
    for (const friend of this.friends) {
      const presence = this.presence.get(friend.id)
      const item = document.createElement("li")
      item.className = "platform-list-item social-friend"
      item.append(avatarElement(friend.displayName, friend.avatarUrl, "md"))
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent = friend.displayName
      const meta = document.createElement("small")
      meta.textContent = presence
        ? statusLabel(presence.visibility)
        : `@${friend.username} · 离线`
      copy.append(name, meta)
      const dot = document.createElement("span")
      dot.className = "platform-status-dot"
      dot.dataset.state = presence?.visibility ?? "offline"
      const chat = iconButton("ph-chat-circle-dots", "打开私聊")
      chat.onclick = () => void this.openFriend(friend)
      const invite = iconButton("ph-sword", "邀请比赛")
      invite.onclick = () => void this.inviteFriend(friend)
      item.append(copy, dot, chat, invite)
      list.append(item)
    }
  }

  private renderPresence() {
    const list = this.root.querySelector<HTMLElement>("#socialPresence")!
    list.replaceChildren()
    const users = [...this.presence.values()].filter(
      (user) => user.userId !== this.session.user.id && !user.invisible
    )
    this.root.querySelector<HTMLElement>("#socialVisibleCount")!.textContent =
      String(users.length + 1)
    if (!users.length) {
      list.append(
        emptyState("ph-radar", "大厅很安静", "好友上线后会实时出现在这里。")
      )
      return
    }
    for (const user of users.slice(0, 12)) {
      const item = document.createElement("li")
      item.className = "platform-list-item"
      item.append(avatarElement(user.displayName, user.avatarUrl, "sm"))
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent = user.displayName
      const meta = document.createElement("small")
      meta.textContent = statusLabel(user.visibility)
      copy.append(name, meta)
      const dot = document.createElement("span")
      dot.className = "platform-status-dot"
      dot.dataset.state = user.visibility
      item.append(copy, dot)
      list.append(item)
    }
  }

  private renderRequests() {
    const root = this.root.querySelector<HTMLElement>("#socialRequests")!
    root.replaceChildren()
    if (!this.requests.length) {
      root.append(
        emptyState("ph-handshake", "暂无申请", "新的好友申请会实时到达。")
      )
      return
    }
    const list = document.createElement("ul")
    list.className = "platform-list"
    for (const request of this.requests) {
      const incoming = request.receiver_id === this.session.user.id
      const item = document.createElement("li")
      item.className = "platform-list-item"
      item.append(
        avatarElement(
          request.display_name,
          request.avatar_key ? `/media/avatar/${request.sender_id}` : null,
          "sm"
        )
      )
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent = request.display_name
      const meta = document.createElement("small")
      meta.textContent = incoming ? "请求添加你为好友" : "等待对方处理"
      copy.append(name, meta)
      item.append(copy)
      if (incoming) {
        const accept = iconButton("ph-check", "接受")
        accept.onclick = () => void this.actOnRequest(request.id, "accept")
        const decline = iconButton("ph-x", "拒绝")
        decline.onclick = () => void this.actOnRequest(request.id, "decline")
        item.append(accept, decline)
      } else {
        const cancel = iconButton("ph-x", "取消")
        cancel.onclick = () => void this.actOnRequest(request.id, "cancel")
        item.append(cancel)
      }
      list.append(item)
    }
    root.append(list)
  }

  private renderInvites() {
    const root = this.root.querySelector<HTMLElement>("#socialInvites")!
    root.replaceChildren()
    if (!this.invites.length) {
      root.append(
        emptyState(
          "ph-sword",
          "暂无比赛邀请",
          "从好友列表邀请一位好友加入等待房间。"
        )
      )
      return
    }
    const list = document.createElement("ul")
    list.className = "platform-list"
    for (const invite of this.invites) {
      const incoming = invite.challengee_id === this.session.user.id
      const item = document.createElement("li")
      item.className = "platform-list-item"
      const icon = document.createElement("span")
      icon.className = "social-rule-badge"
      icon.textContent = ruleShort(invite.rule_type)
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent = incoming
        ? invite.challenger_name
        : invite.challengee_name
      const meta = document.createElement("small")
      meta.textContent = `${ruleLabel(invite.rule_type)} · 房间 ${invite.room_code}`
      copy.append(name, meta)
      item.append(icon, copy)
      if (incoming) {
        const accept = iconButton("ph-check", "接受比赛")
        accept.onclick = () => void this.actOnInvite(invite, "accept")
        const decline = iconButton("ph-x", "拒绝")
        decline.onclick = () => void this.actOnInvite(invite, "decline")
        item.append(accept, decline)
      } else {
        const cancel = iconButton("ph-x", "取消邀请")
        cancel.onclick = () => void this.actOnInvite(invite, "cancel")
        item.append(cancel)
      }
      list.append(item)
    }
    root.append(list)
  }

  private renderConversations() {
    const list = this.root.querySelector<HTMLElement>("#socialConversations")!
    list.replaceChildren()
    if (!this.conversations.length) {
      list.append(
        emptyState("ph-chats", "暂无对话", "与好友开启私聊后会出现在这里。")
      )
      return
    }
    for (const conversation of this.conversations.slice(0, 8)) {
      const item = document.createElement("li")
      item.className = "platform-list-item social-conversation"
      item.tabIndex = 0
      item.append(
        avatarElement(
          conversation.other_name ?? "房",
          conversation.other_avatar
            ? `/media/avatar/${conversation.other_user_id}`
            : null,
          "sm"
        )
      )
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent =
        conversation.kind === "room"
          ? "房间聊天"
          : (conversation.other_name ?? "好友")
      const meta = document.createElement("small")
      meta.textContent = conversation.last_message_body ?? "开始对话"
      copy.append(name, meta)
      item.append(copy)
      item.onclick = () => void this.selectConversation(conversation)
      item.onkeydown = (event) => {
        if (event.key === "Enter") void this.selectConversation(conversation)
      }
      list.append(item)
    }
  }

  private renderChatEmpty() {
    this.root
      .querySelector<HTMLElement>("#socialMessages")!
      .replaceChildren(
        emptyState(
          "ph-chat-circle-dots",
          "选择一位好友",
          "私聊消息只会投递给会话成员，并保留 30 天。"
        )
      )
  }

  private renderMessages() {
    const root = this.root.querySelector<HTMLElement>("#socialMessages")!
    root.replaceChildren()
    if (!this.messages.length) {
      root.append(
        emptyState("ph-sparkle", "开始第一句话", "消息不会广播到公共大厅。")
      )
      return
    }
    for (const message of this.messages) {
      const mine = message.sender_id === this.session.user.id
      const bubble = document.createElement("article")
      bubble.className = "social-message"
      bubble.dataset.mine = String(mine)
      const meta = document.createElement("header")
      const author = document.createElement("strong")
      author.textContent = mine ? "我" : message.sender_name
      const time = document.createElement("time")
      time.dateTime = new Date(message.created_at).toISOString()
      time.textContent = new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(message.created_at)
      meta.append(author, time)
      const body = document.createElement("p")
      body.textContent = message.body
      bubble.append(meta, body)
      root.append(bubble)
    }
    root.scrollTop = root.scrollHeight
  }

  private async searchUsers(query: string) {
    const root = this.root.querySelector<HTMLElement>("#socialSearchResults")!
    root.replaceChildren()
    if (query.length < 2) return
    const users = isLocalDemo()
      ? this.friends.filter(
          (friend) =>
            friend.displayName.includes(query) ||
            friend.username.includes(query)
        )
      : (
          await apiJson<{ users: SocialUser[] }>(
            `/api/users/search?q=${encodeURIComponent(query)}`
          )
        ).users
    const list = document.createElement("ul")
    list.className = "platform-list social-search-results"
    for (const user of users) {
      const item = document.createElement("li")
      item.className = "platform-list-item"
      item.append(avatarElement(user.displayName, user.avatarUrl, "sm"))
      const copy = document.createElement("div")
      copy.className = "platform-list-item__copy"
      const name = document.createElement("strong")
      name.textContent = user.displayName
      const meta = document.createElement("small")
      meta.textContent = `@${user.username}`
      copy.append(name, meta)
      const add = iconButton("ph-user-plus", "发送好友申请")
      add.onclick = () => void this.addFriend(user.id)
      item.append(copy, add)
      list.append(item)
    }
    if (!users.length)
      root.append(
        emptyState(
          "ph-magnifying-glass",
          "没有结果",
          "请检查用户名或尝试完整显示名。"
        )
      )
    else root.append(list)
  }

  private async addFriend(userId: string) {
    if (!isLocalDemo()) {
      await apiJson("/api/social/friends", {
        method: "POST",
        body: JSON.stringify({ userId }),
      })
      await this.loadAll()
    }
    toast("好友申请已发送", "success")
  }

  private async actOnRequest(
    id: string,
    action: "accept" | "decline" | "cancel"
  ) {
    if (!isLocalDemo()) {
      await apiJson(`/api/social/friend-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      })
      await this.loadAll()
    } else {
      this.requests = this.requests.filter((request) => request.id !== id)
      this.renderRequests()
    }
    toast(action === "accept" ? "已成为好友" : "申请已处理", "success")
  }

  private async openFriend(friend: SocialUser) {
    let conversation = this.conversations.find(
      (item) => item.other_user_id === friend.id
    )
    if (!conversation) {
      const id = isLocalDemo()
        ? crypto.randomUUID()
        : (
            await apiJson<{ conversationId: string }>(
              "/api/social/conversations",
              { method: "POST", body: JSON.stringify({ userId: friend.id }) }
            )
          ).conversationId
      conversation = {
        id,
        kind: "direct",
        room_id: null,
        other_user_id: friend.id,
        other_name: friend.displayName,
        other_avatar: friend.avatarUrl,
        last_message_body: null,
        last_message_at: null,
      }
      this.conversations.unshift(conversation)
      this.renderConversations()
    }
    await this.selectConversation(conversation)
  }

  private async selectConversation(conversation: Conversation) {
    this.selectedConversation = conversation
    this.root.querySelector<HTMLElement>("#socialChatTitle")!.textContent =
      conversation.kind === "room"
        ? "房间聊天"
        : (conversation.other_name ?? "好友")
    this.root.querySelector<HTMLFormElement>("#socialComposer")!.hidden = false
    this.root.querySelector<HTMLButtonElement>("#socialInviteCurrent")!.hidden =
      conversation.kind !== "direct"
    this.root.querySelector<HTMLButtonElement>("#socialReportCurrent")!.hidden =
      conversation.kind !== "direct"
    this.messages = isLocalDemo()
      ? [
          {
            id: crypto.randomUUID(),
            sender_id: conversation.other_user_id!,
            sender_name: conversation.other_name!,
            body: "今晚一起打球吗？",
            created_at: Date.now() - 120_000,
          },
          {
            id: crypto.randomUUID(),
            sender_id: this.session.user.id,
            sender_name: this.session.user.displayName,
            body: "好啊，等你来挑战。",
            created_at: Date.now() - 60_000,
          },
        ]
      : (
          await apiJson<{ messages: ChatMessage[] }>(
            `/api/social/conversations/${conversation.id}/messages`
          )
        ).messages
    this.renderMessages()
    this.setMobileView("chat")
  }

  private sendMessage() {
    const input = this.root.querySelector<HTMLTextAreaElement>(
      "#socialMessageInput"
    )!
    const text = input.value.trim()
    if (!text || !this.selectedConversation) return
    const clientMessageId = crypto.randomUUID().replaceAll("-", "_")
    if (isLocalDemo()) {
      this.messages.push({
        id: crypto.randomUUID(),
        sender_id: this.session.user.id,
        sender_name: this.session.user.displayName,
        body: text,
        created_at: Date.now(),
      })
      this.renderMessages()
    } else if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "chat.send",
          conversationId: this.selectedConversation.id,
          clientMessageId,
          text,
        })
      )
    } else {
      toast("实时连接正在恢复，请稍后再试", "error")
      return
    }
    input.value = ""
  }

  private async inviteSelected() {
    const friend = this.friends.find(
      (item) => item.id === this.selectedConversation?.other_user_id
    )
    if (friend) await this.inviteFriend(friend)
  }

  private async inviteFriend(friend: SocialUser) {
    if (isLocalDemo()) {
      toast(`已向 ${friend.displayName} 发送八球邀请`, "success")
      return
    }
    const created = await apiJson<{ room: RoomLaunchDescriptor }>(
      "/api/rooms",
      {
        method: "POST",
        body: JSON.stringify({
          ruleType: "eightball",
          options: { source: "friend-invite" },
          tableStyle: this.session.user.tableStyle,
          environmentStyle: this.session.user.environmentStyle,
        }),
      }
    )
    await apiJson("/api/invites", {
      method: "POST",
      body: JSON.stringify({
        challengeeId: friend.id,
        roomId: created.room.id,
        expiresInSeconds: 120,
      }),
    })
    toast(`已向 ${friend.displayName} 发送比赛邀请`, "success")
    await this.enterWaitingRoom(created.room, "create")
  }

  private async actOnInvite(
    invite: Invite,
    action: "accept" | "decline" | "cancel"
  ) {
    let acceptedRoom: AnyRoomLaunchDescriptor | undefined
    if (!isLocalDemo()) {
      const response = await apiJson<{
        status: string
        room?: AnyRoomLaunchDescriptor
      }>(`/api/invites/${invite.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      })
      acceptedRoom = response.room
    }
    if (action === "accept") {
      if (!acceptedRoom) {
        acceptedRoom = {
          id: invite.room_id,
          code: invite.room_code,
          status: "waiting",
          ruleType: invite.rule_type as RoomLaunchDescriptor["ruleType"],
          options: {},
          tableStyle: this.session.user.tableStyle,
          environmentStyle: this.session.user.environmentStyle,
          memberRole: "player",
          createdAt: Date.now(),
        }
      }
      await this.enterWaitingRoom(acceptedRoom, "join")
      return
    }
    this.invites = this.invites.filter((item) => item.id !== invite.id)
    this.renderInvites()
    toast("邀请已处理", "success")
  }

  private async enterWaitingRoom(
    room: AnyRoomLaunchDescriptor,
    onlineAction: "create" | "join"
  ) {
    if (room.gameType === "table-tennis") {
      globalThis.location.assign(tableTennisRoomUrl(room))
      return
    }
    const selection: LauncherSelection = {
      rule: room.ruleType,
      opponent: "online",
      botLevel: 5,
      quality: renderQualityModeForPreference(this.session.preferences.quality),
      cueStyle: this.session.user.cueStyle,
      tableStyle: room.tableStyle,
      environmentStyle: room.environmentStyle,
      onlineAction,
      roomCode: room.code,
      roomInstanceId: room.id,
    }
    globalThis.location.assign(
      await buildGameUrl(selection, globalThis.location.href)
    )
  }

  private async reportSelected() {
    const userId = this.selectedConversation?.other_user_id
    if (!userId) return
    const details = globalThis
      .prompt("请简要说明举报原因（不超过 1000 字）")
      ?.trim()
    if (!details) return
    if (!isLocalDemo()) {
      await apiJson("/api/social/reports", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: userId,
          reason: "用户举报",
          details,
        }),
      })
    }
    toast("举报已提交给管理员", "success")
  }

  private async updateVisibility(visibility: string) {
    if (!isLocalDemo()) {
      await apiJson("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ visibility }),
      })
      if (this.socket?.readyState === WebSocket.OPEN)
        this.socket.send(JSON.stringify({ type: "presence.set", visibility }))
    }
    this.session.user.visibility =
      visibility as PlatformMe["user"]["visibility"]
    toast(
      visibility === "invisible"
        ? "已隐身；不会出现在普通用户在线列表中"
        : `状态已切换为${statusLabel(visibility)}`,
      "success"
    )
  }

  private connect() {
    if (isLocalDemo() || !this.session.capabilities.social) return
    const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(
      `${protocol}//${globalThis.location.host}/ws/social`
    )
    this.socket = socket
    socket.onopen = () => {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    socket.onmessage = (event) => this.receiveRealtime(event.data)
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null
      if (event.code !== 4403) {
        this.reconnectTimer = globalThis.setTimeout(() => this.connect(), 1800)
      }
    }
    socket.onerror = () => socket.close()
  }

  private receiveRealtime(raw: unknown) {
    if (typeof raw !== "string") return
    let message: any
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (message.type === "presence.snapshot") {
      this.presence = new Map(
        (message.users as Presence[]).map((user) => [user.userId, user])
      )
      this.renderFriends()
      this.renderPresence()
    } else if (message.type === "chat.message") {
      const item = message.message
      if (item.conversationId === this.selectedConversation?.id) {
        this.messages.push({
          id: item.id,
          sender_id: item.senderId,
          sender_name: item.senderName,
          body: item.body,
          created_at: item.createdAt,
        })
        this.renderMessages()
      }
      void this.refreshRealtimeLists()
    } else if (
      ["friend.requested", "friend.accepted", "friend.removed"].includes(
        message.type
      )
    ) {
      void this.refreshRealtimeLists()
    } else if (
      ["invite.created", "invite.updated", "invite.expired"].includes(
        message.type
      )
    ) {
      void this.refreshRealtimeLists()
    } else if (
      message.type === "approval.changed" ||
      message.type === "moderation.session_revoked"
    ) {
      toast(message.note ?? message.reason ?? "在线权限已变更", "error")
      globalThis.setTimeout(() => globalThis.location.reload(), 1200)
    } else if (message.type === "error") {
      toast(message.message ?? "实时操作失败", "error")
    }
  }

  private async refreshRealtimeLists() {
    if (isLocalDemo()) return
    await this.loadAll()
  }

  private setMobileView(view: typeof this.mobileView) {
    this.mobileView = view
    this.root.dataset.mobileView = view
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-social-view]"
    )) {
      button.setAttribute(
        "aria-selected",
        String(button.dataset.socialView === view)
      )
    }
  }
}

function iconButton(icon: string, label: string) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "platform-icon-button"
  button.setAttribute("aria-label", label)
  const item = document.createElement("i")
  item.className = `ph ${icon}`
  button.append(item)
  return button
}

function statusLabel(value: string) {
  return (
    (
      {
        online: "在线",
        away: "暂离",
        dnd: "勿扰",
        invisible: "隐身",
      } as Record<string, string>
    )[value] ?? "离线"
  )
}

function ruleLabel(value: string) {
  return (
    (
      {
        eightball: "八球",
        nineball: "九球",
        fourball: "四球追分",
        snooker: "斯诺克",
        threecushion: "三库",
        "singles-11": "乒乓球 · 11 分单打",
      } as Record<string, string>
    )[value] ?? value
  )
}

function ruleShort(value: string) {
  return (
    (
      {
        eightball: "8",
        nineball: "9",
        fourball: "4",
        snooker: "S",
        threecushion: "3",
        "singles-11": "乒",
      } as Record<string, string>
    )[value] ?? "B"
  )
}

async function bootstrap() {
  const session = await platformGate()
  if (!session) return
  const root = mountPlatformPage(
    session,
    "lobby",
    "社交大厅",
    "看见实时在线好友，选择隐身，发起私聊或邀请一场比赛。"
  )
  await new SocialPage(session, root).init()
}

export function mountLobbyInto(session: PlatformMe, root: HTMLElement) {
  return new SocialPage(session, root).init()
}

if (!document.querySelector("#appRoot")) {
  void bootstrap().catch((error) => {
    toast(error instanceof Error ? error.message : "社交大厅加载失败", "error")
  })
}
