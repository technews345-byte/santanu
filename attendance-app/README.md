# Punch Attendance

A location-checked punch in / punch out web app (PWA) for phones.

- Save your work location and an allowed radius in **Settings**.
- **Punch In / Punch Out** only works when the phone's GPS shows you inside that radius
  with good accuracy. Each punch stores time, coordinates, accuracy and distance.
- Shows today's hours and history, and exports CSV / JSON.
- Optional reminders on arrival or departure (you still punch manually).
- Optional webhook: each real punch is POSTed as JSON to another attendance system's
  official API (`event: clock_in | clock_out`, employee, time, latitude, longitude, accuracy_m, distance_m).

Data is stored only on the device (localStorage). Location requires HTTPS (or localhost).

## Run

Serve the folder over HTTPS (for example GitHub Pages or Netlify), open it on your phone,
allow location, and use "Add to Home screen". For a local try-out: `python3 -m http.server`
and open `http://localhost:8000`.

Status: GPS punching has not been tested in a browser yet.
