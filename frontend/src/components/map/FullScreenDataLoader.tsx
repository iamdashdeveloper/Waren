/*
 * From Uiverse.io by anand_4957 - https://uiverse.io/anand_4957/spotty-newt-52
 * MIT License, Copyright (c) anand_4957 (Anand Kotadiya), anand_4957 (Anand Kotadiya)
 */
import { useEffect, useState } from "react"

const waitingMessages = [
  "Please be patient. The developer has already fought enough battles with PostGIS today.",
  "Someone is evaluating this work. The developer is pretending not to be nervous.",
  "It will just be a minute hold up im fetching the data",
  "Click the tour button for a guided tour of the application",
]

function FullScreenDataLoader() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % waitingMessages.length)
    }, 4200)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div
      aria-label="Loading WAREN map data"
      aria-live="polite"
      className="waren-loader-overlay"
      role="status"
    >
      <div aria-hidden="true" className="waren-loader-scene">
        <div className="waren-loader-clouds">
          <div className="waren-loader-cloud waren-loader-cloud1" />
          <div className="waren-loader-cloud waren-loader-cloud2" />
          <div className="waren-loader-cloud waren-loader-cloud3" />
          <div className="waren-loader-cloud waren-loader-cloud4" />
          <div className="waren-loader-cloud waren-loader-cloud5" />
        </div>
        <div className="waren-loader-speeder">
          <span className="waren-loader-speeder-streak">
            <span />
            <span />
            <span />
            <span />
          </span>
          <div className="waren-loader-base">
            <span />
            <div className="waren-loader-face" />
          </div>
        </div>
        <div className="waren-loader-longfazers">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="waren-loader-copy">
        <p className="waren-loader-eyebrow">WAREN · WATER INFRASTRUCTURE NAVIGATOR</p>
        <h1>Preparing your map</h1>
        <p className="waren-loader-subtitle">
          Loading spatial layers and fetching the data…
        </p>
        <p
          className="waren-loader-message"
          key={messageIndex}
        >
          {waitingMessages[messageIndex]}
        </p>
      </div>
    </div>
  )
}

export default FullScreenDataLoader
