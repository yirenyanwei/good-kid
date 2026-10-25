// app.ts —— 全局入口：云开发初始化（可选）+ 全局样式变量由 app.wxss 承载
App({
  globalData: {
    // V0 本地模式不依赖云；注册 AppID 并开通云环境后置 true
    cloudEnabled: false,
    envId: '',
  },
  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库过低，无法使用云能力')
      return
    }
    // 只要有云能力就先 init（未配 envId 时用默认环境）；callFunction 失败由各调用方自行降级
    if (this.globalData.envId) {
      wx.cloud.init({
        env: this.globalData.envId,
        traceUser: true,
      })
    } else {
      wx.cloud.init({ traceUser: true })
    }
  },
})
