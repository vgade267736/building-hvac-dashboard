# Building HVAC Dashboard

This project contains a minimal FastAPI backend used to run EnergyPlus simulations using OpenStudio.

## Prerequisites

- **Python 3.10** (the OpenStudio bindings were built for this version)
- **EnergyPlus** installed and available as `/usr/local/bin/energyplus`. This typically
  comes from the [OpenStudio](https://github.com/NREL/OpenStudio/releases) or
  [EnergyPlus](https://energyplus.net/download) distributions. Make sure the
  executable is on your `PATH` or create a symlink to `/usr/local/bin/energyplus`.
- **OpenStudio Python bindings** – installed via `pip install openstudio` (see
  `backend/requirements.txt`).

## Setup

1. (Optional) create a virtual environment:
   ```bash
   python3.10 -m venv venv
   source venv/bin/activate
   ```
2. Install the backend dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

## Running the server

From the `backend` directory run:

```bash
uvicorn app.main:app --reload
```

The API will be available on `http://localhost:8000`.

## API Endpoints

### `POST /simulate`
Upload a weather file (`.epw`) and either an EnergyPlus `idf_file` **or**
provide building dimensions (`length`, `width`, `height`). The backend stores
inputs under `/tmp/<run_id>` and launches EnergyPlus. The response contains the
`run_id` used to query results later.

Relevant portion of the implementation:
```python
@app.post("/simulate")
async def simulate(
    bg: BackgroundTasks,
    idf_file: UploadFile | None = File(default=None),
    weather_file: UploadFile = File(...),
    length: float | None = Form(default=None),
    width:  float | None = Form(default=None),
    height: float | None = Form(default=None),
):
```
【F:backend/app/main.py†L27-L35】

### `GET /results/{run_id}`
Returns parsed results from EnergyPlus. It checks for errors and reads the
`eplusout.csv` file generated in `/tmp/<run_id>`.
```python
@app.get("/results/{run_id}")
async def get_results(run_id: str):
    results_dir = os.path.join("/tmp", run_id)
    csv_file = os.path.join(results_dir, "eplusout.csv")
    err_file = os.path.join(results_dir, "eplusout.err")
```
【F:backend/app/main.py†L87-L92】

### `GET /status`
Returns whether an EnergyPlus process is running.

## Example Usage

```bash
# Run a simulation using a pre-built IDF file
curl -F weather_file=@weather.epw \
     -F idf_file=@model.idf \
     http://localhost:8000/simulate

# Run using just dimensions
curl -F weather_file=@weather.epw \
     -F length=10 -F width=10 -F height=3 \
     http://localhost:8000/simulate

# Retrieve results
curl http://localhost:8000/results/<run_id>
```

The results endpoint returns JSON with an array of `{time, value}` objects
containing hourly zone air temperatures.
