import os
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def run_simulation(
    idf_path: str,
    tmp_dir: str,
    weather_path: str,
    energyplus_path: str | None = None,
) -> str:
    try:
        exe = energyplus_path or os.getenv("ENERGYPLUS_PATH", "/usr/local/bin/energyplus")

        version_result = subprocess.run(
            [exe, "--version"],
            capture_output=True,
            text=True
        )
        logger.info(f"Using EnergyPlus executable: {exe}")
        logger.info(f"EnergyPlus version: {version_result.stdout.strip()}")

        for path in [idf_path, weather_path]:
            if not Path(path).exists():
                raise FileNotFoundError(f"Input file not found: {path}")

        Path(tmp_dir).mkdir(parents=True, exist_ok=True)

        cmd = [
            exe,
            "-w", str(weather_path),
            "-d", str(tmp_dir),
            "-r",
            str(idf_path)
        ]
        logger.info(f"Executing: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
            check=False
        )

        if result.returncode != 0:
            logger.error("EnergyPlus stderr:\n%s", result.stderr)
            raise Exception(f"EnergyPlus failed (code {result.returncode})")

        csv_file = Path(tmp_dir) / "eplusout.csv"
        if not csv_file.exists():
            err_file = Path(tmp_dir) / "eplusout.err"
            if err_file.exists():
                logger.error("Error file contents:\n%s", err_file.read_text())
            raise Exception(f"Missing CSV output: {csv_file}")

        err_file = Path(tmp_dir) / "eplusout.err"
        if err_file.exists():
            content = err_file.read_text()
            if "** Severe  **" in content:
                raise Exception(f"EnergyPlus reported severe errors:\n{content[:1000]}")

        done_marker = Path(tmp_dir) / "done.txt"
        done_marker.write_text("done")

        return tmp_dir

    except subprocess.TimeoutExpired:
        raise Exception("EnergyPlus timed out after 5 minutes")
    except Exception as e:
        raise Exception(f"Simulation failed: {e}")
