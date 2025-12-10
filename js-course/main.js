"use strict";

// for our contexts, a "base" is an image in A0/A1 and a mesh in A2/A4

/** @namespace */
var Main = Main || {
  // whether we are dealing with images or meshes
  // if false, images will be loaded during initialization. if true, meshes will
  // be dynamically loaded whenever used.
  usingMeshes: false,

  /**
   * The images or meshes in the stack.
   * @type {!Array<!Image426>|!Array<!Mesh>}
   */
  baseStack: [],
  /**
   * Cached filter application info.
   * @type {!Array<!Object>}
   */
  applicationCache: [],

  // whether to print out debug info, namely filter processing time
  debugPrint: true,

  // time in ms after which to pause filter application to update display
  // (can only pause between filters)
  applyRefreshTime: 1000,

  // time in ms before "working..." popup is displayed
  workingDialogDelay: 500,

  // Real-time continuous animation system
  continuousAnimationRunning: false,
  continuousAnimationFrameId: null,
  continuousAnimationStartTime: 0,
  continuousAnimationSpeed: 1.0, // Animation speed multiplier
  continuousAnimationFilterInst: null,
  continuousAnimationLastUpdateTime: 0,
  continuousAnimationUpdateInterval: 50, // Update filter every 50ms (~20fps)
  animationTime: 0, // Global time value for ripple animation (continuously increasing)
};

Main.refreshDisplay = function () {
  console.warn("`Main.refreshDisplay` not implemented");
};

Main.hideProcessingText = function () {
  $("#loading").hide();
};

Main.showErrorText = function (show) {
  $("#error").css("display", show ? "inline" : "none");
};

const arraysEqual = function (a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;
  for (const [x, y] of Array.zip(a, b)) {
    if (x === y) continue;
    if (x == null || y == null) return false;
    if (
      typeof PixelColor !== "undefined" &&
      PixelColor.prototype.isPrototypeOf(x) &&
      x.equals(y)
    ) {
      continue;
    }
    return false;
  }
  return true;
};

/** Applies all the filters in the history. */
Main.applyFilters = function () {
  clearTimeout(Main.applyTimeout);
  Main.applyTimeout = null;

  const cache = Main.applicationCache;

  const baseStack = [];
  Main.baseStack = baseStack;

  let totalFilterTime = 0;

  Main.showErrorText(false);

  if (!Main.animatedValFound) {
    Main.hideProcessingText();
  }

  if (!Main.usingMeshes && Main.debugPrint) {
    // if using meshes, print later in case it isn't loaded yet
    console.log("----------\nBEGINNING FILTER APPLICATION\n----------");
  }

  for (const [i, filterInst] of Array.enumerated([
    ...Gui.globalCommands,
    ...Gui.historyFilters,
  ])) {
    if (filterInst == null) continue;
    const filterDef = filterInst.filterDef;
    const filterName = filterDef.name;

    // display "working..." dialog if it's been some time since apply start
    if (Main.totalApplyTimeSinceFirstFilter > Main.workingDialogDelay) {
      Gui.alertOnce(`Working... (${filterName})`);
    }

    const args = filterInst.argsList.slice();

    const cachedData = cache[i];

    if (filterDef.pushBase) {
      let base;
      let baseName;
      if (!Main.usingMeshes && filterName === "Push Image") {
        baseName = filterDef.getParamValue(args, "image");
        base = Main.images[baseName];
        assert(base, `Image not found (should be preloaded): ${baseName}`);
      } else if (Main.usingMeshes && filterName === "Base Mesh") {
        baseName = filterDef.getParamValue(args, "mesh");
        base = Main.meshes[baseName];
        if (base == null) {
          // try filter application again when the mesh loads
          assert(Main.loadMesh, "Could not find function `Main.loadMesh`");
          Main.loadMesh(baseName);
          return;
        }
        if (Main.debugPrint) {
          // actually beginning filter application
          // print here to avoid double print if mesh isn't loaded yet
          console.log("----------\nBEGINNING FILTER APPLICATION\n----------");
        }
      } else {
        assert(false, `Unsupported push base command: ${filterName}`);
      }

      // clear rest of cache on base change
      if (cachedData && cachedData.baseName !== baseName) {
        cache.splice(i + 1);
      }

      const baseCopy = base.createCopy();
      cache[i] = {
        baseName: baseName,
        lastFilterName: filterName,
        args: args.slice(),
        base: baseCopy,
      };
      baseStack.push(baseCopy);
    } else if (filterDef.isFilter) {
      // Apply
      
      const isAnimating = Main.continuousAnimationRunning && 
                         Main.continuousAnimationFilterInst === filterInst;
      
      if (
        !isAnimating &&
        cachedData != null &&
        cachedData.lastFilterName === filterName &&
        arraysEqual(args, cachedData.args)
      ) {
        baseStack.splice(-filterDef.numInputs);
        baseStack.push(cachedData.base.createCopy());
        if (Main.debugPrint) {
          console.log(`${filterName} operation (${i + 1}) loaded from cache`);
        }
      }

      // cache invalid from here onward
      else {
        cache.splice(i + 1);

        function failApply(error) {
          console.error(error);
          Main.hideProcessingText();
          Main.showErrorText(true);
          clearTimeout(Main.applyTimeout);
        }

        const poppedInputs = baseStack.splice(-filterDef.numInputs);
        if (poppedInputs.length < filterDef.numInputs) {
          const error =
            `ERROR: Filter requires ${filterDef.numInputs} inputs, but ` +
            `${poppedInputs.length} found`;
          failApply(error);
          Gui.alertOnce(error);
          return;
        }

        const argsWithInputs = poppedInputs
          .map((base) => base.createCopy())
          .concat(args);

        const filterStartTime = performance.now();

        // call the function with the values in args as arguments
        let filterResult;
        try {
          filterResult = filterDef.filterFunc(...argsWithInputs);
          if (Main.usingMeshes) {
            // first argument will be mutated
            filterResult = argsWithInputs[0];
          } else {
            // use result of the filter function
            assert(
              filterResult != null,
              `No image returned by filter: ${filterDef.funcName}`
            );
          }
        } catch (error) {
          failApply(error);
          return;
        }
        // push result
        baseStack.push(filterResult);

        const filterTime = Math.round(performance.now() - filterStartTime);
        if (Main.debugPrint) {
          console.log(
            `${filterName} operation (${i + 1}) took ${filterTime} ms`
          );
        }

        if (Gui.hasAlert()) {
          console.warn("Alert is showing; stopping filter application");
          // show up to the last filter
          Main.refreshDisplay();
          return;
        }

        totalFilterTime += filterTime;
        Main.totalApplyTimeSinceFirstFilter += filterTime;

        cache[i] = {
          // no base name
          lastFilterName: filterName,
          args: args.slice(),
          base: filterResult.createCopy(),
        };
      }
    }

    
    if (totalFilterTime > Main.applyRefreshTime) {
      clearTimeout(Main.applyTimeout);
      Main.applyTimeout = setTimeout(Main.applyFilters, 0);
      Main.refreshDisplay();
      return;
    }
  }
  // clear the rest of the cache (no more filters)
  cache.splice(Gui.historyFilters.length);

  // only reach here when final filter application completes

  clearTimeout(Main.applyTimeout);
  Gui.closeAlert();

  Main.refreshDisplay();

  if (Main.animatedValFound) {
    Main.gifEncoder.addFrame(Main.ctx);

    // advance step
    Main.animatedValData.current += Main.animatedValData.step;
    const value = Main.animatedValData.current;

    // Track cycles for smooth looping
    if (!Main.animatedValData.cycleCount) {
      Main.animatedValData.cycleCount = 0;
    }

    // encode + display gif
    if (Main.animatedValData.isDone(value)) {
      Main.animatedValData.cycleCount++;
      
      // Generate 2 full cycles for smooth looping, then finish
      if (Main.animatedValData.cycleCount >= 2) {
        Main.gifEncoder.finish();
        const gifBinary = Main.gifEncoder.stream().getData();
        const gifUrl = "data:image/gif;base64," + encode64(gifBinary);
        $("#canvas-div").hide();
        $("#result-div")
          .html("")
          .append($("<img>", { id: "animated-gif", src: gifUrl }));

        Main.hideProcessingText();
      } else {
        // Loop back to start for another cycle
        Main.animatedValData.current = Main.animatedValData.start;
        Main.animatedValData.onChangeFunc(Main.animatedValData.current);
      }
    } else {
      Main.animatedValData.onChangeFunc(value);
    }
  }
};

/** Updates the view when the GUI controls change. */
Main.handleControlsChanged = function () {
  if (!Main.usingMeshes && !Main.allImagesLoaded) return;
  Main.totalApplyTimeSinceFirstFilter = 0;
  Main.applyFilters();
};

/**
 * Starts continuous real-time animation for a filter parameter.
 * @param {!Object} filterInst - The filter instance to animate.
 * @param {number} paramIndex - The index of the parameter to animate.
 */
Main.startContinuousAnimation = function (filterInst, paramIndex) {
  if (Main.continuousAnimationRunning) {
    Main.stopContinuousAnimation();
  }

  Main.continuousAnimationRunning = true;
  Main.continuousAnimationStartTime = performance.now();
  Main.continuousAnimationLastUpdateTime = 0;
  Main.animationTime = 0; // Reset time when starting
  Main.continuousAnimationFilterInst = filterInst;
  Main.continuousAnimationParamIndex = paramIndex;

  console.log('Starting continuous animation');
  Main.continuousAnimationLoop();
};

/**
 * Stops the continuous animation.
 */
Main.stopContinuousAnimation = function () {
  Main.continuousAnimationRunning = false;
  if (Main.continuousAnimationFrameId != null) {
    cancelAnimationFrame(Main.continuousAnimationFrameId);
    Main.continuousAnimationFrameId = null;
  }
  // Reset animation time when stopped
  Main.animationTime = 0;
};

/**
 * Continuous animation loop that updates filter parameters in real-time.
 * For ripple animation, this continuously increases time while keeping value fixed.
 */
Main.continuousAnimationLoop = function () {
  if (!Main.continuousAnimationRunning) return;

  const now = performance.now();
  const elapsed = (now - Main.continuousAnimationStartTime) * Main.continuousAnimationSpeed;
  
  // Continuously increase animation time (in radians, so ripples flow outward)
  // Time increases indefinitely to create continuous flow
  Main.animationTime = elapsed * 0.001;
  

  
  // Throttle filter updates - only update every n milliseconds
  if (now - Main.continuousAnimationLastUpdateTime >= Main.continuousAnimationUpdateInterval) {
    Main.continuousAnimationLastUpdateTime = now;
    // Trigger filter reapplication (value stays the same, time increases)
    Main.handleControlsChanged();
  }

  Main.continuousAnimationFrameId = requestAnimationFrame(() => Main.continuousAnimationLoop());
};

$(() => {
  Main.init?.();
});
