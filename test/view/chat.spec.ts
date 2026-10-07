import { Chat } from "../../src/view/chat"
import { initDom } from "./dom"

initDom()

describe("Chat", () => {
  beforeEach(() => {
    initDom()
  })

  it("appends plain text without replacing the lobby link", () => {
    const chat = new Chat(jest.fn())
    const originalLobby = document.getElementById("lobbyOverlay")

    chat.showMessage("Start")

    const chatoutput = document.getElementById("chatoutput")
    const currentLobby = document.getElementById("lobbyOverlay")

    expect(chatoutput?.textContent).toContain("Start")
    expect(currentLobby).toBe(originalLobby)
  })

  it("renders remote html as text without creating links", () => {
    const chat = new Chat(jest.fn())
    const originalLobby = document.getElementById("lobbyOverlay")

    chat.showMessage('<a class="pill" href="/test">upload</a>')

    const currentLobby = document.getElementById("lobbyOverlay")
    const links = document.querySelectorAll("#chatoutput a")

    expect(currentLobby).toBe(originalLobby)
    expect(links).toHaveLength(0)
    expect(document.getElementById("chatoutput")?.textContent).toContain(
      '<a class="pill" href="/test">upload</a>'
    )
  })

  it("renders structured messages, deduplicates them and tracks unread", () => {
    const chat = new Chat(jest.fn())
    const message = {
      id: "message-1",
      senderId: "remote-user",
      senderName: "远端玩家",
      body: "准备好了吗？",
      createdAt: Date.UTC(2026, 7, 17, 10, 30),
      isMine: false,
    }

    chat.showMessage(message)
    chat.showMessage(message)

    expect(document.querySelectorAll(".match-chat-message")).toHaveLength(1)
    expect(
      document.querySelector(".match-chat-message strong")?.textContent
    ).toBe("远端玩家")
    expect(document.getElementById("matchChatUnread")?.textContent).toBe("1")

    document.getElementById("matchChatToggle")?.click()
    expect(
      document.querySelector(".chatarea")?.getAttribute("data-chat-state")
    ).toBe("open")
    expect(document.getElementById("matchChatUnread")?.hidden).toBe(true)
  })

  it("clears messages and unread state when disposed", () => {
    const chat = new Chat(jest.fn())
    chat.showMessage({
      id: "old-match-message",
      senderName: "上一局玩家",
      body: "上一局消息",
      createdAt: Date.now(),
      isMine: false,
    })

    chat.dispose()

    expect(document.getElementById("chatoutput")?.childElementCount).toBe(0)
    expect(document.getElementById("matchChatUnread")?.hidden).toBe(true)
    expect(
      document.querySelector(".chatarea")?.getAttribute("data-chat-state")
    ).toBe("peek")
  })
})
