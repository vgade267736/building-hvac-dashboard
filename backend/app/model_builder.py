import openstudio

def build_model(defn: dict) -> openstudio.model.Model:
    """Construct a simple OpenStudio model using the provided parameters."""
    L, W, H = defn["dimensions"]
    weather_path = defn.get("weather_path")

    model = openstudio.model.Model()
    space = openstudio.model.Space(model)
    space.setName("Space 1")
    zone = openstudio.model.ThermalZone(model)
    zone.setName("Thermal Zone 1")
    space.setThermalZone(zone)

    faces = [
        [(0, 0, 0), (0, W, 0), (L, W, 0), (L, 0, 0)],
        [(0, 0, H), (0, W, H), (L, W, H), (L, 0, H)],
        [(0, 0, 0), (0, 0, H), (0, W, H), (0, W, 0)],
        [(L, 0, 0), (L, W, 0), (L, W, H), (L, 0, H)],
        [(0, 0, 0), (L, 0, 0), (L, 0, H), (0, 0, H)],
        [(0, W, 0), (0, W, H), (L, W, H), (L, W, 0)]
    ]

    for coords in faces:
        vertices = openstudio.Point3dVector()
        for x, y, z in coords:
            vertices.append(openstudio.Point3d(x, y, z))
        surface = openstudio.model.Surface(vertices, model)
        surface.setSpace(space)
        surface.setOutsideBoundaryCondition("Outdoors")
        surface.assignDefaultSurfaceType()
        surface.assignDefaultSunExposure()
        surface.assignDefaultWindExposure()

    material = openstudio.model.StandardOpaqueMaterial(model)
    material.setName("SingleLayerMaterial")
    material.setThickness(0.1)
    material.setConductivity(0.5)
    material.setDensity(800)
    material.setSpecificHeat(1000)

    construction = openstudio.model.Construction(model)
    construction.insertLayer(0, material)

    for surface in model.getSurfaces():
        surface.setConstruction(construction)

    out_var = openstudio.model.OutputVariable("Zone Air Temperature", model)
    out_var.setReportingFrequency("Hourly")
    out_var.setKeyValue(zone.nameString())

    if weather_path:
        epw_file = openstudio.EpwFile.load(openstudio.toPath(weather_path))
        if not epw_file.is_initialized():
            raise RuntimeError("Failed to load EPW file")
        weather_file_obj = openstudio.model.WeatherFile.setWeatherFile(model, epw_file.get())
        if not weather_file_obj.is_initialized():
            raise RuntimeError("Failed to set weather file in OpenStudio model")

    return model
