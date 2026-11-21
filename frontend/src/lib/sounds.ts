import { Howl } from "howler"
import clickUrl from "@/assets/sounds/click.mp3"
import typingUrl from "@/assets/sounds/typing.mp3"

let clickSound: Howl | null = null
let typingSound: Howl | null = null
let typingFallback: number | null = null
let interactionSequence = 0
let lastUiClickAt = 0

function stopInteractionSounds() {
  if (typingFallback !== null) {
    window.clearTimeout(typingFallback)
    typingFallback = null
  }
  clickSound?.stop()
  typingSound?.stop()
  clickSound?.off("end")
  clickSound?.off("playerror")
  clickSound?.off("loaderror")
  typingSound?.off("end")
  typingSound?.off("playerror")
  typingSound?.off("loaderror")
}

function beginInteractionSequence() {
  const sequence = ++interactionSequence
  stopInteractionSounds()
  return sequence
}

function getClickSound() {
  clickSound ??= new Howl({
    src: [clickUrl],
    volume: 0.22,
    preload: true,
    onloaderror: () => console.warn("WAREN click sound could not be loaded."),
  })
  return clickSound
}

function getTypingSound() {
  typingSound ??= new Howl({
    src: [typingUrl],
    volume: 0.14,
    preload: true,
    onloaderror: () => console.warn("WAREN typing sound could not be loaded."),
  })
  return typingSound
}

export function playUIClick() {
  const now = Date.now()
  if (now - lastUiClickAt < 70) return
  lastUiClickAt = now
  try {
    const sound = getClickSound()
    sound.stop()
    sound.play()
  } catch (error) {
    console.warn("WAREN UI click sound playback failed.", error)
  }
}

export function playUITyping() {
  try {
    const sound = getTypingSound()
    sound.stop()
    sound.play()
  } catch (error) {
    console.warn("WAREN UI typing sound playback failed.", error)
  }
}

export function playInfrastructureSelectionSounds() {
  const sequence = beginInteractionSequence()

  const playTyping = () => {
    if (sequence !== interactionSequence) return
    if (typingFallback !== null) {
      window.clearTimeout(typingFallback)
      typingFallback = null
    }
    try {
      getTypingSound().play()
    } catch (error) {
      console.warn("WAREN typing sound playback failed.", error)
    }
  }

  try {
    const sound = getClickSound()
    sound.stop()
    sound.once("end", playTyping)
    sound.once("playerror", playTyping)
    sound.once("loaderror", playTyping)
    sound.play()
    typingFallback = window.setTimeout(playTyping, 700)
  } catch (error) {
    console.warn("WAREN click sound playback failed.", error)
    typingFallback = window.setTimeout(playTyping, 180)
  }
}

export function playConnectionViewSounds(onComplete: () => void) {
  const sequence = beginInteractionSequence()
  let completed = false
  let typingStarted = false
  let fallback: number | null = null

  const complete = () => {
    if (completed || sequence !== interactionSequence) return
    completed = true
    if (fallback !== null) window.clearTimeout(fallback)
    if (typingFallback !== null) {
      window.clearTimeout(typingFallback)
      typingFallback = null
    }
    onComplete()
  }

  const playTyping = () => {
    if (sequence !== interactionSequence || typingStarted) return
    typingStarted = true
    if (fallback !== null) {
      window.clearTimeout(fallback)
      fallback = null
    }
    try {
      const sound = getTypingSound()
      sound.once("end", complete)
      sound.once("playerror", complete)
      sound.once("loaderror", complete)
      sound.play()
      fallback = window.setTimeout(complete, 1400)
    } catch (error) {
      console.warn("WAREN typing sound playback failed.", error)
      complete()
    }
  }

  try {
    const sound = getClickSound()
    sound.once("end", playTyping)
    sound.once("playerror", playTyping)
    sound.once("loaderror", playTyping)
    sound.play()
    fallback = window.setTimeout(playTyping, 700)
  } catch (error) {
    console.warn("WAREN click sound playback failed.", error)
    playTyping()
  }

  return () => {
    if (sequence !== interactionSequence) return
    interactionSequence += 1
    if (fallback !== null) window.clearTimeout(fallback)
    stopInteractionSounds()
  }
}
