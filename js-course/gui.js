"use strict";

assert(GuiConfig, "`gui.js` requires `guiConfig.js`");
assert(GuiConfig.checkSetup(), "`gui.js` requires `guiSetup.js`");

/**
 * The user interface to choose the filters.
 * @namespace
 */
var Gui = Gui || { hidden: false };
Gui.historyCounter = 1;

Gui.init = function () {
  if (Gui.hidden) {
    // load filters from the url
    Gui.historyFilters = [];
    const globalArgs = Gui.loadFromUrl();

    // create global commands and controls
    Gui.globalCommands = [];
    for (const filterDef of GuiConfig.filterDefs) {
      if (!filterDef.isGlobal) continue;
      // use loaded args from url
      const commandInst = Gui.makeFilterInstance(
        filterDef,
        globalArgs[filterDef.name]
      );
      Gui.globalCommands.push(commandInst);
    }

    Gui.fullyInitialized = true;
    Gui.handleControlsChanged();
    return;
  }

  // make dat.gui gui objects (initialization order matters: right to left)
  Gui.historyDatGui = new dat.GUI();
  Gui.filterListDatGui = new dat.GUI();

  // make a button for each filter/command, in the correct folder
  const filterFolders = {};
  for (const filterDef of GuiConfig.filterDefs) {
    if (filterDef.isHidden) continue;

    // get the gui folder where the button goes (or make it if doesn't exist)
    let filterFolder;
    if (filterDef.folderName) {
      filterFolder = filterFolders[filterDef.folderName];
      if (filterFolder == null) {
        // make new folder
        filterFolder = Gui.filterListDatGui.addFolder(filterDef.folderName);
        filterFolders[filterDef.folderName] = filterFolder;
      }
    } else {
      // use top-level folder
      filterFolder = Gui.filterListDatGui;
    }

    // generate the button function and make the button
    const applyFunc =
      filterDef.applyFunc ??
      function () {
        if (
          filterDef.pushBase ||
          Array.any(
            (filterInst) => filterInst.filterDef.pushBase,
            Gui.globalCommands,
            Gui.historyFilters
          )
        ) {
          // only allow the filter to apply if it's pushing a base or a base has
          // already been pushed
          Gui.addHistoryEntry(filterDef);
        }
      };
    filterFolder.add({ [filterDef.name]: applyFunc }, filterDef.name);
  }

  // make the global commands before the history folder
  const globalCommandFolders = [];
  // in case there are controls called "History", just keep adding spaces...
  let historyFolderName = "History";
  for (const filterDef of GuiConfig.filterDefs) {
    if (!filterDef.isGlobal) continue;
    const commandName = filterDef.name;
    if (commandName === historyFolderName) {
      historyFolderName += " ";
    }
    const datFolder = Gui.historyDatGui.addFolder(commandName);
    globalCommandFolders.push({ filterDef, datFolder });
  }

  // construct the history pane
  Gui.historyFolder = Gui.historyDatGui.addFolder(historyFolderName);
  Gui.historyFolder.open();

  Gui.historyFilters = [];

  // populate the history pane
  const globalArgs = Gui.loadFromUrl();

  // create global commands and controls
  Gui.globalCommands = [];
  for (const { filterDef, datFolder } of globalCommandFolders) {
    // use loaded args from url
    const commandInst = Gui.makeFilterInstance(
      filterDef,
      globalArgs[filterDef.name],
      datFolder
    );
    Gui.globalCommands.push(commandInst);
  }

  // initialize the gui, if needed
  GuiConfig.onInit?.();

  Gui.fullyInitialized = true;

  // update
  Gui.handleControlsChanged();
};

Gui.handleControlsChanged = function () {
  if (!Gui.fullyInitialized || Gui.suspendDisplayUpdate) return;
  Main.handleControlsChanged?.();
  Gui.updateUrl();
};

/**
 * Gets the filter definition with the given name.
 * @param {string} filterName
 * @returns {?GuiConfig.FilterDef} The filter definition, or `undefined` if not
 *     found.
 */
Gui.getFilterDef = function (filterName) {
  const filterDef = GuiConfig.filterDefs.find(
    (filterDef) => filterDef.name === filterName
  );
  assert(filterDef != null, `Could not find "${filterName}" filter def`);
  return filterDef;
};

Gui.makeFilterInstance = function (
  filterDef,
  argVals,
  existingDatFolder = null
) {
  let folder = null;
  if (!Gui.hidden) {
    if (existingDatFolder != null) {
      folder = existingDatFolder;
    } else {
      // make the folder for the history entry
      // HACK: number all history entries to keep folder names unique (required
      // by dat.gui)
      const folderName = `${Gui.historyCounter++}: ${filterDef.name}`;
      folder = Gui.historyFolder.addFolder(folderName);
    }
    folder.open();
  }

  // make the filter instance
  const filterInst = {
    filterDef: filterDef,
    argsList: [],
    guiControls: [],
    guiFolder: folder,
  };

  // make param controls in gui folder
  Main.animatedValFound = false;
  for (const [paramIndex, paramDef] of Array.enumerated(filterDef.paramDefs)) {
    const paramName = paramDef.name;

    function defaultOnChangeFunc(value) {
      filterInst.argsList[paramIndex] = value;
      Gui.handleControlsChanged();
    }
    function colorOnChangeFunc(value, { usingDefault = false } = {}) {
      let color;
      if (Array.isArray(value)) {
        // color controller returned an rgb array
        const [r, g, b, alpha] = value.map((x) => x / 255);
        color = new PixelColor(
          // default each component to 0 if not given
          [r, g, b].map((val) => val ?? 0),
          alpha
        );
      } else {
        // color controller returned a string
        try {
          color = PixelColor.rgbFromHex(value);
        } catch (e) {
          try {
            color = PixelColor.rgbFromString(value);
          } catch (e) {
            // don't go into infinite recursion loop
            assert(!usingDefault, `Could not parse color: ${value}`);
            console.error("Could not parse color:", value);
            // default val should be an array
            colorOnChangeFunc(paramDef.defaultVal, { usingDefault: true });
            return;
          }
        }
      }
      if (paramDef.mustBeOpaque) {
        // force alpha = 1
        color.alpha = 1;
      }
      defaultOnChangeFunc(color);
    }
    const onChangeFunc =
      paramDef.type === GuiConfig.ParamDef.Type.COLOR
        ? colorOnChangeFunc
        : defaultOnChangeFunc;

    // try to get the value from the given args
    let value = null;
    const argVal = argVals?.[paramIndex];
    if (argVal != null) {
      switch (paramDef.type) {
        case GuiConfig.ParamDef.Type.BOOLEAN: {
          value = argVal.boolean;
          break;
        }
        case GuiConfig.ParamDef.Type.STRING: {
          value = argVal.original;
          break;
        }
        case GuiConfig.ParamDef.Type.COLOR: {
          value = argVal.color;
          if (value == null) {
            // try to parse the original string (only supports hex)
            try {
              const color = PixelColor.rgbFromHex(argVal.original);
              value = [...color.data, color.alpha].map((val) =>
                Math.floor(val * 255)
              );
            } catch (e) {
              // unknown color; ignore it
            }
          }
          // preemptively ignore the alpha value so that the GUI doesn't get
          // initialized with a useless fourth alpha component
          if (
            paramDef.mustBeOpaque &&
            Array.isArray(value) &&
            value.length > 3
          ) {
            value = value.slice(0, 3);
          }
          break;
        }
        case GuiConfig.ParamDef.Type.DROPDOWN: {
          value = argVal.original;
          break;
        }
        case GuiConfig.ParamDef.Type.SLIDER: {
          const { min, max, step: sliderStep } = paramDef.sliderRange;
          function clampValue(val) {
            return Math.min(Math.max(min, val), max);
          }
          if (argVal.isAnimated) {
            assert(
              Gui.hidden,
              "Animated parameters are only allowed in batch mode"
            );
            assert(
              !Main.animatedValFound,
              "Only one animated parameter is allowed at a time"
            );
            Main.animatedValFound = true;

            let { start, end, step } = argVal.animationRange;

            // validate the values
            start = clampValue(start);
            end = clampValue(end);
            if (!paramDef.isFloat) {
              step = Math.round(step);
            }
            if (step === 0) {
              step = sliderStep;
            }

            let isDone;
            if (step > 0) {
              isDone = (current) => current >= end;
            } else {
              isDone = (current) => current <= end;
            }

            value = start;
            Main.animatedValData = {
              current: value,
              start: start,
              step: step,
              end: end,
              isDone,
              onChangeFunc,
            };
          } else {
            value = argVal.number;
            if (value != null) {
              value = clampValue(value);
              // could also make sure value is a multiple of `sliderStep` away
              // from `min`, but that's a little unnecessary
            }
          }
          break;
        }
      }
    }
    // use the default value if no arg or invalid
    value ??= paramDef.defaultVal;

    // save value
    filterInst.argsList[paramIndex] = value;

    if (Gui.hidden) {
      // immediately trigger and continue
      onChangeFunc(value);
      continue;
    }

    // add to gui
    let addFuncName = "add";
    let initValue = value;
    const extraParams = [];
    if (paramDef.type === GuiConfig.ParamDef.Type.COLOR) {
      addFuncName = "addColor";
    } else if (paramDef.type === GuiConfig.ParamDef.Type.DROPDOWN) {
      extraParams.push(paramDef.dropdownOptions);
    } else if (paramDef.type === GuiConfig.ParamDef.Type.SLIDER) {
      // HACK(drew): dat.gui needs to be initialized with a float for float
      // sliders
      if (paramDef.isFloat) {
        initValue = 0.5;
      }
      const { min, max, step } = paramDef.sliderRange;
      extraParams.push(min, max, step);
    }

    // NOTE: When the value in the gui changes, this object (the first argument)
    // will be updated according to the passed in key (the second argument).
    // This means we could save an object `argsValues` in `filterInst` which
    // would automatically update whenever the values change. However, we are
    // using a manually-updated `argsList` instead so that we can use a custom
    // color class and so that it is a parallel array with the param defs of a
    // filter.
    const paramControl = folder[addFuncName](
      { [paramName]: initValue },
      paramName,
      ...extraParams
    );
    paramControl.onChange(onChangeFunc);
    // update the value and run the onChange function
    paramControl.setValue(value);

    filterInst.guiControls[paramIndex] = paramControl;
  }

  // add any buttons
  for (const { label, func } of filterDef.buttons) {
    if (label == null || func == null) continue;
    folder.add({ [label]: func }, label);
  }

  if (!Gui.hidden) {
    // Add continuous animation buttons for appropriate filters
    if (
      (filterDef.name === "Contrast" ||
        filterDef.name === "Edge" ||
        filterDef.name === "Custom Filter" ||
        filterDef.name === "Breathing Clouds") &&
      !filterDef.isGlobal
    ) {
      // Find the slider parameter
      let sliderParamIndex = -1;
      for (const [paramIndex, paramDef] of Array.enumerated(
        filterDef.paramDefs
      )) {
        if (paramDef.type === GuiConfig.ParamDef.Type.SLIDER) {
          sliderParamIndex = paramIndex;
          break;
        }
      }

      if (sliderParamIndex !== -1) {
        filterInst.isAnimating = false;
        const animationButtonObj = { "▶ Animate": () => {} };

        const toggleAnimation = () => {
          if (filterInst.isAnimating) {
            // Stop animation
            Main.stopContinuousAnimation();
            filterInst.isAnimating = false;
            const oldButton = filterInst.animationButton;
            if (oldButton) {
              folder.remove(oldButton);
            }
            animationButtonObj["▶ Animate"] = toggleAnimation;
            filterInst.animationButton = folder.add(
              animationButtonObj,
              "▶ Animate"
            );
          } else {
            // Start animation
            Main.startContinuousAnimation(filterInst, sliderParamIndex);
            filterInst.isAnimating = true;
            const oldButton = filterInst.animationButton;
            if (oldButton) {
              folder.remove(oldButton);
            }
            animationButtonObj["⏸ Stop"] = toggleAnimation;
            filterInst.animationButton = folder.add(
              animationButtonObj,
              "⏸ Stop"
            );
          }
        };

        animationButtonObj["▶ Animate"] = toggleAnimation;
        filterInst.animationButton = folder.add(
          animationButtonObj,
          "▶ Animate"
        );
      }
    }

    if (!filterDef.isGlobal) {
      // add delete button
      let deleteButtonName;
      let deleteButtonFunc;
      if (filterDef.deleteBelow) {
        deleteButtonName = "Delete Below";
        deleteButtonFunc = () => {
          Gui.deleteHistoryBelow(filterInst);
          Gui.deleteHistoryEntry(filterInst);
          Gui.handleControlsChanged();
        };
      } else {
        deleteButtonName = "Delete";
        deleteButtonFunc = () => {
          // Stop animation if this filter is being animated
          if (
            filterInst.isAnimating &&
            Main.continuousAnimationFilterInst === filterInst
          ) {
            Main.stopContinuousAnimation();
            filterInst.isAnimating = false;
          }
          Gui.deleteHistoryEntry(filterInst);
          Gui.handleControlsChanged();
        };
      }
      folder.add({ [deleteButtonName]: deleteButtonFunc }, deleteButtonName);
      Gui.historyFolder.open();
    }
  }

  return filterInst;
};

/**
 * Adds a filter instance to the history.
 * @param {!GuiConfig.FilterDef} filterDef - The definition of the filter to
 *     add.
 * @param {?Array} argVals - Optional param values to initialize the filter
 *     with.
 * @returns {?Object} - An object representing the filter instance, if the
 *     filter is actually a filter.
 */
Gui.addHistoryEntry = function (filterDef, argVals) {
  if (filterDef.isGlobal || !filterDef.isFilter) return null;

  Gui.suspendDisplayUpdate = !Gui.hidden;

  const filterInst = Gui.makeFilterInstance(filterDef, argVals);

  Gui.historyFilters.push(filterInst);

  Gui.suspendDisplayUpdate = false;
  Gui.handleControlsChanged();

  return filterInst;
};

/**
 * Deletes the history entry of the given filter instance.
 * @param {!Object} filterInst - The object representing the filter instance.
 */
Gui.deleteHistoryEntry = function (filterInst) {
  const index = Gui.historyFilters.indexOf(filterInst);
  if (index === -1) return;
  Gui.historyFolder.removeFolder(filterInst.guiFolder);
  Gui.historyFilters.splice(index, 1);
  Gui.updateUrl();
};

/**
 * Deletes all the history entries below (but not including) the given filter
 * instance.
 * @param {!Object} filterInst - The object representing the filter instance.
 */
Gui.deleteHistoryBelow = function (filterInst) {
  const index = Gui.historyFilters.indexOf(filterInst);
  if (index === -1) return;
  Gui.historyFilters.splice(index + 1).forEach((historyFilterInst) => {
    Gui.historyFolder.removeFolder(historyFilterInst.guiFolder);
  });
  Gui.updateUrl();
};

/**
 * Parses commands from the URL and loads them into the GUI.
 * @returns {!Object<string, !Array>} Any parsed global or control command args.
 */
Gui.loadFromUrl = function () {
  const globalCommandNames = new Set();
  const globalArgs = {};
  const globalControlsByName = {};
  const filterDefsByName = {};
  for (const filterDef of GuiConfig.filterDefs) {
    const name = filterDef.name;
    if (filterDef.isGlobal) {
      if (!filterDef.isControls) {
        globalCommandNames.add(name);
      } else {
        globalArgs[name] = [];
        for (const [paramIndex, paramDef] of Array.enumerated(
          filterDef.paramDefs
        )) {
          const controlName = paramDef.name;
          if (!(controlName in globalControlsByName)) {
            globalControlsByName[controlName] = {
              commandName: name,
              paramIndex,
            };
          }
        }
      }
      continue;
    }
    if (filterDef.isFilter) {
      filterDefsByName[name] = filterDef;
    }
  }

  // parse url
  for (const cmd of Parser.parseUrlCommands()) {
    // check if global command
    if (globalCommandNames.has(cmd.name)) {
      globalArgs[cmd.name] = cmd.args;
      continue;
    }
    // check if global control
    const globalControls = globalControlsByName[cmd.name];
    if (globalControls != null) {
      if (cmd.args.length > 0) {
        if (cmd.args.length > 1) {
          console.warn(`Control param "${cmd.name}" expects only one arg`);
        }
        // save the first arg
        globalArgs[globalControls.commandName][globalControls.paramIndex] =
          cmd.args[0];
      }
      continue;
    }
    // check if known filter command
    const filterDef = filterDefsByName[cmd.name];
    if (filterDef != null) {
      Gui.addHistoryEntry(filterDef, cmd.args);
    }
  }
  return globalArgs;
};

// gets rid of the ".0000000001" etc when stringifying floats
// from https://stackoverflow.com/q/1458633
function stripFloatError(number, precision = null) {
  // Default precision is 12
  precision ??= 12;
  if (number && number.toPrecision) {
    return parseFloat(number.toPrecision(precision));
  } else {
    return number;
  }
}

function numberList(array, precision) {
  return array.map((val) => stripFloatError(val, precision)).join(",");
}

function arrayToString(array, precision) {
  return ["[", numberList(array, precision), "]"].join("");
}

function vectorToString(vector, precision) {
  return arrayToString(vector.toArray(), precision);
}

/** Builds a URL args string based on the current filter history. */
Gui.buildUrl = function (enableAnimation) {
  let lastCanAnimateIndex = -1;
  if (enableAnimation) {
    lastCanAnimateIndex = Gui.historyFilters.findLastIndex(
      (filterInst) => filterInst.filterDef.canAnimate
    );
  }

  function buildParamValue(paramDef, argVal) {
    if (argVal === "") return argVal;
    if (!isNaN(argVal)) return stripFloatError(argVal);
    if (
      typeof PixelColor !== "undefined" &&
      PixelColor.prototype.isPrototypeOf(argVal)
    ) {
      const includeAlpha = !(
        paramDef != null &&
        paramDef.type === GuiConfig.ParamDef.Type.COLOR &&
        paramDef.mustBeOpaque
      );
      return argVal.toRgbString(includeAlpha);
    }
    return argVal;
  }

  function processArgs(filterInst, desc, callback = buildParamValue) {
    const filterDef = filterInst.filterDef;
    return filterInst.argsList.map((argVal, i) => {
      const paramDef = filterDef.paramDefs[i];
      if (paramDef == null) {
        // shouldn't happen
        console.error(
          `No param found at index ${i} for ${desc}: ${filterDef.name}`
        );
      }
      return callback(paramDef, argVal);
    });
  }

  const urlParts = Gui.globalCommands
    .flatMap((commandInst) => {
      const commandDef = commandInst.filterDef;
      if (commandDef.isControls) {
        // each param gets its own command name
        return processArgs(commandInst, "global control", (paramDef, argVal) =>
          [paramDef.name, "=", buildParamValue(paramDef, argVal)].join("")
        );
      }
      const argsListParts = processArgs(commandInst, "global command");
      return [[commandDef.name, "=", argsListParts.join(";")].join("")];
    })
    .concat(
      Gui.historyFilters.map((filterInst, i) => {
        const filterDef = filterInst.filterDef;
        const argsListParts = processArgs(
          filterInst,
          "filter",
          (paramDef, argVal) => {
            if (i === lastCanAnimateIndex) {
              // there is a single slider param that can be animated
              if (
                paramDef != null &&
                paramDef.type === GuiConfig.ParamDef.Type.SLIDER
              ) {
                // animated parameter
                let values;
                if (Main.animatedValFound) {
                  const { start, end, step } = Main.animatedValData;
                  values = [start, end, step];
                } else {
                  const { min, max, step } = paramDef.sliderRange;
                  values = [min, max, step];
                }
                return ["(", numberList(values), ")"].join("");
              }
            }
            return buildParamValue(paramDef, argVal);
          }
        );
        return [filterDef.name, "=", argsListParts.join(";")].join("");
      })
    );
  // use regexp to replace all
  const url = urlParts.join("&").replace(/ /g, "_");
  return url;
};

const stateObj = {};
/** Updates the URL according to the current filter history. */
Gui.updateUrl = function () {
  const enableAnimation = Gui.batchMode && Main.animatedValFound;
  const url =
    (Page.FILENAME ?? (Gui.batchMode ? "batch.html" : "index.html")) +
    "?" +
    Gui.buildUrl(enableAnimation);
  history.pushState(stateObj, "", url);
};

/** Shows an alert on the page. */
Gui.alertOnce = function (msg, alertId = "alert-div") {
  $("#main-div,#mesh-canvas").css("opacity", "0.3");
  const $alert = $(`#${alertId}`);
  // clear content
  $alert.html("");
  // add alert content
  const $dismissButton = $("<button>", { type: "button" }).text("ok");
  $dismissButton.on("click", (event) => {
    Gui.closeAlert(alertId);
  });
  $alert.append($("<p>").text(msg), $dismissButton);
  // show alert
  $alert.css("display", "inline");
};

/** Returns true if an alert is currently showing. */
Gui.hasAlert = function (alertId = "alert-div") {
  return $(`#${alertId}`).css("display") !== "none";
};

/** Dismisses an alert on the page. */
Gui.closeAlert = function (alertId = "alert-div") {
  $("#main-div,#mesh-canvas").css("opacity", "1");
  $(`#${alertId}`).hide();
};
