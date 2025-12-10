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
      // APPLY FILTER
      // use cache?
      if (
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

    // taking too long? halt the function to update the display, then
    // immediately resume
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

    // encode + display gif
    if (Main.animatedValData.isDone(value)) {
      Main.gifEncoder.finish();
      const gifBinary = Main.gifEncoder.stream().getData();
      const gifUrl = "data:image/gif;base64," + encode64(gifBinary);
      $("#canvas-div").hide();
      $("#result-div")
        .html("")
        .append($("<img>", { id: "animated-gif", src: gifUrl }));

      Main.hideProcessingText();
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

$(() => {
  Main.init?.();
});
