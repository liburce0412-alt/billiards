import { sanitiseRoomOptions } from "../../server/roomoptions"

describe("room options", () => {
  it("does not trust or publish client-supplied assist flags", () => {
    expect(
      sanitiseRoomOptions(
        {
          quality: "high",
          adminDemoRequested: true,
          adminDemoRoom: true,
          adminDemoOwnerId: "forged",
        },
        "user",
        "user-id"
      )
    ).toEqual({ quality: "high" })
  })

  it("keeps administrator assistance out of ordinary room metadata", () => {
    expect(
      sanitiseRoomOptions(
        { quality: "high", adminDemoRequested: true },
        "admin",
        "admin-id"
      )
    ).toEqual({ quality: "high" })
  })
})
