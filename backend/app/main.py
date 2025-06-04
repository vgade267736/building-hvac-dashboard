import logging
import os
import uuid
import csv
import tempfile

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import psutil

import openstudio
from app.model_builder import build_model
from app.runner import run_simulation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/simulate")
async def simulate(
    bg: BackgroundTasks,
    idf_file: UploadFile | None = File(default=None),
    weather_file: UploadFile = File(...),
    length: float | None = Form(default=None),
    width:  float | None = Form(default=None),
    height: float | None = Form(default=None),
):
    """Run a simulation by saving inputs and queuing EnergyPlus."""
    run_id = str(uuid.uuid4())
    tmp_dir = f"/tmp/{run_id}"
    os.makedirs(tmp_dir, exist_ok=True)

    idf_path = os.path.join(tmp_dir, "input.idf")
    weather_path = os.path.join(tmp_dir, "weather.epw")

    try:
        with open(weather_path, "wb") as f:
            f.write(await weather_file.read())
    except OSError as e:
        logger.error(f"Saving weather file failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if idf_file:
        try:
            with open(idf_path, "wb") as f:
                f.write(await idf_file.read())
        except OSError as e:
            logger.error(f"Saving uploaded IDF failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    else:
        if None in (length, width, height):
            raise HTTPException(
                status_code=400,
                detail="Provide either an IDF file or all three dimensions (length, width, height)."
            )
        try:
            model = build_model({
                "dimensions": (length, width, height),
                "weather_path": weather_path
            })

            translator = openstudio.energyplus.ForwardTranslator()
            workspace = translator.translateModel(model)

            errors = translator.errors()
            if len(errors) > 0:
                first_err = errors[0]
                msg = first_err.logMessage() if hasattr(first_err, "logMessage") else str(first_err)
                raise RuntimeError(f"Translation error: {msg}")

            workspace.save(openstudio.toPath(idf_path), True)

        except (RuntimeError, OSError) as e:
            logger.error(f"IDF generation error: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    bg.add_task(run_simulation, idf_path, tmp_dir, weather_path)
    return {"run_id": run_id, "status": "running"}

@app.get("/results/{run_id}")
async def get_results(run_id: str):
    """Return parsed results for the given run ID."""
    results_dir = os.path.join("/tmp", run_id)
    csv_file = os.path.join(results_dir, "eplusout.csv")
    err_file = os.path.join(results_dir, "eplusout.err")

    # Check if directory exists
    if not os.path.exists(results_dir):
        raise HTTPException(
            status_code=404,
            detail=f"Results directory not found at {results_dir}"
        )

    # Check error file first
    if os.path.exists(err_file):
        with open(err_file, "r") as f:
            errors = f.read()
            if "** Severe  **" in errors:
                raise HTTPException(
                    status_code=500,
                    detail=f"EnergyPlus reported errors:\n{errors[:1000]}"
                )

    # Check CSV file
    if not os.path.exists(csv_file):
        available_files = "\n".join(os.listdir(results_dir))
        raise HTTPException(
            status_code=404,
            detail=f"CSV output not found. Available files:\n{available_files}"
        )

    try:
        # Use csv.DictReader to robustly parse the CSV including quoted values
        with open(csv_file, newline="") as f:
            reader = csv.DictReader(f)

            # Ensure file is not empty and headers are present
            if not reader.fieldnames:
                raise HTTPException(
                    status_code=500,
                    detail="CSV file is empty"
                )

            # Find relevant columns dynamically
            temp_col = next((h for h in reader.fieldnames if "Temperature" in h), None)
            time_col = next((h for h in reader.fieldnames if "Date/Time" in h), None)

            if not temp_col or not time_col:
                raise HTTPException(
                    status_code=500,
                    detail=f"Required columns not found. Available headers: {reader.fieldnames}"
                )

            data = []
            for row in reader:
                try:
                    value = float(row[temp_col])
                except (ValueError, KeyError) as e:
                    raise HTTPException(
                        status_code=500,
                        detail=f"Error parsing CSV data: {e}"
                    )
                data.append({
                    "time": row[time_col],
                    "value": value
                })

            return {"data": data}

    except (OSError, ValueError) as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing results: {str(e)}"
        )
    
@app.get("/status")
async def status():
    """Report currently running EnergyPlus processes."""
    procs = [
        p.info for p in psutil.process_iter(attrs=["name"])
        if "energyplus" in (p.info["name"] or "").lower()
    ]
    return {"energyplus_running": bool(procs), "processes": procs}
