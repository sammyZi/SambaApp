package com.sambafilebrowser

import android.os.Bundle
import android.view.WindowManager
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SambaFileBrowser"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Request the highest available refresh rate (120Hz on supported devices)
    try {
      val display = windowManager.defaultDisplay
      val supportedModes = display.supportedModes
      var maxMode = supportedModes[0]
      for (mode in supportedModes) {
        if (mode.refreshRate > maxMode.refreshRate) {
          maxMode = mode
        }
      }
      val params: WindowManager.LayoutParams = window.attributes
      params.preferredDisplayModeId = maxMode.modeId
      window.attributes = params
    } catch (e: Exception) {
      // Silently fail on devices that don't support this
    }
  }
}
