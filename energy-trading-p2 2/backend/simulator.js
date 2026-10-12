// =====================================================
// SMART ENERGY METER SIMULATOR
// =====================================================

function randomNumber(min, max) {
  return +(Math.random() * (max - min) + min).toFixed(1)
}

async function getVerifiedMeters() {
  const response = await fetch(
    'http://localhost:5000/api/meters'
  )

  return response.json()
}

async function sendReading(meter_id) {
  const energy_generated = randomNumber(3, 10)
  const energy_consumed = randomNumber(2, 8)

  const reading = {
    meter_id,
    energy_generated,
    energy_consumed
  }

  const response = await fetch(
    'http://localhost:5000/api/readings',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(reading)
    }
  )

  const data = await response.json()

  console.log(
    'sent:',
    reading,
    '-> server:',
    data
  )
}

async function runSimulator() {
  try {
    const meters = await getVerifiedMeters()

    if (meters.length === 0) {
      console.log(
        'no verified meters yet, waiting for admin approval...'
      )
      return
    }

    for (const meter_id of meters) {
      await sendReading(meter_id)
    }
  } catch (error) {
    console.error('simulator error:', error.message)
  }
}

// Send reading every 5 seconds
setInterval(runSimulator, 5000)
