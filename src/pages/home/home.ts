import { Component, NgZone } from '@angular/core'
import { Subscription } from 'rxjs'
import { Geolocation } from '@ionic-native/geolocation'
import { BackgroundMode } from '@ionic-native/background-mode/ngx'
import { LocalNotifications } from '@ionic-native/local-notifications'
import { NavController, Platform, ToastController } from 'ionic-angular'
import {
  BackgroundGeolocation,
  BackgroundGeolocationConfig,
  BackgroundGeolocationResponse,
  BackgroundGeolocationEvents
} from '@ionic-native/background-geolocation/ngx'

interface CurrentLocation {
  latitude: Number
  longitude: Number
  date: Date
}

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {
  inBackground = false
  currentLocation: CurrentLocation = {
    latitude: 0,
    longitude: 0,
    date: null
  }
  savedLocations = []
  isLocationEnabled = false
  backgroundModeEnabled = false
  private watchSubscription: Subscription
  private onResumeSubscription: Subscription
  private onPauseSubscription: Subscription
  backgroundGeolocationConfig: BackgroundGeolocationConfig = {
    desiredAccuracy: 10,
    stationaryRadius: 20,
    distanceFilter: 10,
    debug: true, //  enable this hear sounds for background-geolocation life-cycle.
    stopOnTerminate: false, // enable this to clear background location settings when the app terminates
    // Android only section
    locationProvider: 1,
    startForeground: true,
    interval: 6000,
    fastestInterval: 5000,
    activitiesInterval: 10000,
    startOnBoot: true, // Start background service on device boot
    // iOS only section
    pauseLocationUpdates: false, // Pauses location updates when app is paused
  }
  geolocationConfig = {
    timeout: 5000,
    frequency: 5000,
    enableHighAccuracy: false
  }

  constructor(
    public zone: NgZone,
    private platform: Platform,
    public navCtrl: NavController,
    private geolocation: Geolocation,
    private toastCtrl: ToastController,
    private backgroundMode: BackgroundMode,
    private localNotifications: LocalNotifications,
    private backgroundGeolocation: BackgroundGeolocation) {

    this.platform.ready().then(() => {
      this.backgroundModeEnabled = this.backgroundMode.isEnabled()
    })

    this.onResumeSubscription = platform.resume.subscribe(() => this.onResume())
    this.onPauseSubscription = platform.pause.subscribe(() => this.onPause())
  }

  //The event fires when an application is retrieved from the background
  async onResume() {
    this.inBackground = false
    this.showToast('Bienvenido de nuevo!')
    let lastLocation: CurrentLocation
    if (this.savedLocations.length) {
      lastLocation = this.savedLocations[this.savedLocations.length - 1]
      this.savedLocations = []
    }
    if (this.platform.is('cordova')) {
      const locations = await this.backgroundGeolocation.getLocations()
      if (locations && locations.length) {
        lastLocation = locations[locations.length - 1]
      }
    }
    if (lastLocation) {
      this.setNewLocation(lastLocation.latitude, lastLocation.longitude)
    }
  }

  onPause() {
    this.inBackground = true
    this.savedLocations = []
    this.showNotification('App en pausa')
  }

  async ionViewWillEnter() {
    await this.platform.ready()
    if (this.platform.is('cordova')) {
      this.isLocationEnabled = !!(await this.backgroundGeolocation.isLocationEnabled())
    }
  }

  async startTracking() {
    await this.platform.ready()
    if (this.platform.is('cordova')) {
      // Support Background Tracking
      await this.backgroundGeolocation.configure(this.backgroundGeolocationConfig)
      this.backgroundGeolocation.on(BackgroundGeolocationEvents.location)
        .subscribe((location: BackgroundGeolocationResponse) => {
          this.setNewLocation(location.latitude, location.longitude)
        })
      this.backgroundGeolocation.start()
    }
    // Only Foreground Tracking
    this.watchSubscription = this.geolocation.watchPosition(this.geolocationConfig)
      .subscribe((data) => {
        if (data.coords) {
          this.setNewLocation(data.coords.latitude, data.coords.longitude)
        }
      })

    const position = await this.geolocation.getCurrentPosition()
    this.setNewLocation(position.coords.latitude, position.coords.longitude)
    this.isLocationEnabled = true
  }

  setNewLocation(latitude, longitude) {
    const newLocation: CurrentLocation = {
      latitude: latitude,
      longitude: longitude,
      date: new Date()
    }
    console.log(JSON.stringify(newLocation))
    this.zone.run(() => {
      this.currentLocation = newLocation
      this.savedLocations.push(this.currentLocation)
      if (this.inBackground) {
        this.showNotification(`Nueva ubicación => Lat: ${newLocation.latitude}, Lon: ${newLocation.longitude}`)
      }
    })
  }

  stopTracking() {
    this.showToast('Seguimiento detenido')
    this.showNotification('Seguimiento detenido')
    this.unsubscribeWatch()
    if (this.platform.is('cordova')) {
      this.backgroundGeolocation.finish()
      this.backgroundGeolocation.stop()
    }
  }

  toggleBackgroundMode() {
    if (!this.backgroundMode.isEnabled()) {
      this.backgroundMode.enable()
      this.backgroundModeEnabled = true
      //this.backgroundMode.moveToBackground()
      //this.backgroundMode.disableWebViewOptimizations()
    }
    else {
      this.backgroundMode.disable()
      this.backgroundModeEnabled = false
      //this.backgroundMode.moveToForeground()
    }
  }

  showToast(message) {
    this.toastCtrl.create({
      message: message,
      duration: 3000,
      position: 'bottom'
    }).present()
  }

  showNotification(text: string) {
    this.localNotifications.schedule({
      text: text,
      led: 'FF0000',
      sound: null
    })
  }

  unsubscribeWatch() {
    this.isLocationEnabled = false
    this.watchSubscription && this.watchSubscription.unsubscribe()
  }

  ngOnDestroy() {
    this.showNotification('App detenida')
    // always unsubscribe your subscriptions to prevent leaks
    this.onResumeSubscription.unsubscribe()
    this.onPauseSubscription.unsubscribe()
    this.unsubscribeWatch()
    if (this.platform.is('cordova') && this.platform.is('ios')) {
      this.backgroundGeolocation.finish()
    }
  }
}
