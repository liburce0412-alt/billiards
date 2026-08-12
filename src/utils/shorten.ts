export function shorten(url, action) {
  action(url)
}

export function share(url) {
  const shareData = {
    title: "Billiards",
    url: url,
  }
  if (navigator.canShare?.(shareData)) {
    navigator
      .share(shareData)
      .then(() => console.log("shared successfully"))
      .catch((e) => {
        console.log("Error: " + e)
      })
    return `link shared`
  }
  navigator.clipboard?.writeText(url)
  return "回放链接已复制"
}
