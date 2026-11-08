/** 自定义导航安全区。页面自己画返回时关掉系统导航栏，避免上下两个返回。 */

export function readNavSafeArea(): { statusBarHeight: number; navPadRight: number } {
  const sys = wx.getWindowInfo()
  const statusBarHeight = sys.statusBarHeight || 20
  let navPadRight = 96
  try {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.left > 0 && sys.windowWidth > menu.left) {
      navPadRight = Math.ceil(sys.windowWidth - menu.left + 8)
    }
  } catch (e) {
    navPadRight = 96
  }
  return { statusBarHeight, navPadRight }
}

/** 练习页拦住侧滑离开，避免没确认就把这一轮丢掉 */
export function armLeaveGuard(message: string): void {
  if (typeof wx.enableAlertBeforeUnload !== 'function') return
  wx.enableAlertBeforeUnload({ message })
}

/** 确认离开或正常交卷前先撤掉拦截，再跳转 */
export function disarmLeaveGuard(done?: () => void): void {
  const finish = () => {
    if (done) done()
  }
  if (typeof wx.disableAlertBeforeUnload !== 'function') {
    finish()
    return
  }
  wx.disableAlertBeforeUnload({ success: finish, fail: finish })
}
