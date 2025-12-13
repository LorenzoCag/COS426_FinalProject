/**
 * This file defines the setup for the GUI:
 * - imageNames
 * - filterDefs
 * - onInit()
 */

"use strict";

assert(GuiConfig, "`guiSetup.js` requires `guiConfig.js`");

GuiConfig.imageNames = [
  "caféTerraceAtNight.png",
  "exampleWater.png",
  "impressionSunrise.png",
  "jacksonPollock.png",
  "laGrenouillère.png",
  "starryNight.png",
  "starryNightOverTheRhône.png",
  "theScream.png",
  "theWaterLilyPond.png",
  "vincentVanGogh.png",
  "waterLilies.png",
  "womanWithAParasol.png",
  "flow.png",
];

const sampleModeParam = {
  name: "sample mode",
  type: GuiConfig.ParamDef.Type.DROPDOWN,
  dropdownOptions: ["point", "bilinear", "gaussian"],
};

const directionParam = {
  name: "direction",
  type: GuiConfig.ParamDef.Type.DROPDOWN,
  dropdownOptions: ["left", "right"],
};

const hueParam = {
  name: "hue",
  type: GuiConfig.ParamDef.Type.DROPDOWN,
  dropdownOptions: ["red", "orange", "yellow"],
};

/**
 * The definitions of the filters and commands in the GUI.
 * @type {!Array<!GuiConfig.FilterDef>}
 */
GuiConfig.filterDefs = GuiConfig.FilterDef.fromArray([
  // GENERAL
  {
    name: "Push Image",
    pushBase: true,
    paramDefs: [
      {
        name: "image",
        type: GuiConfig.ParamDef.Type.DROPDOWN,
        dropdownOptions: GuiConfig.imageNames,
      },
    ],
  },
  {
    name: "Batch Mode",
    batchMode: true,
  },

  {
    name: "Animation",
    animationMode: true,
  },

  {
    name: "Create Flow Vectors",
    isFilter: false,
    applyFunc: function () {
      // get the image
      let img = "";
      for (const cached of Array.reversed(Main.applicationCache)) {
        if (cached.baseName == null) continue;
        img = cached.baseName;
        break;
      }
      const args = { initial: img };

      // if the "Morph" filter is being used, load the given marker file
      const morphFilterInst = Gui.historyFilters.find(
        (filterInst) => filterInst.filterDef.name === "Flow"
      );
      if (morphFilterInst != null) {
        // find the lines file being used
        const linesFile = morphFilterInst.filterDef.getParamValue(
          morphFilterInst.argsList,
          "lines file"
        );
        if (linesFile != null) {
          args.marker = linesFile;
        }
      }

      // open "morphLines.html"
      const argsStr = Object.entries(args)
        .map(([key, value]) => `${key}=${encodeURI(value)}`)
        .join("&");
      window.open(`morphLines.html?${argsStr}`);
    },
  },

  // LUMINANCE OPERATIONS
  {
    name: "Brightness",
    folderName: "Luminance",
    canAnimate: true,
    paramDefs: [
      {
        name: "brightness",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: -1.0, max: 1.0, step: 0.1 },
        isFloat: true,
      },
    ],
  },
  {
    name: "Contrast",
    folderName: "Luminance",
    canAnimate: true,
    paramDefs: [
      {
        name: "contrast",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: -1.0, max: 1.0, step: 0.1 },
        isFloat: true,
      },
    ],
  },
  {
    name: "Gamma",
    folderName: "Luminance",
    canAnimate: true,
    paramDefs: [
      {
        name: "gamma",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: -2.0, max: 2.0, step: 0.1 },
        isFloat: true,
      },
    ],
  },
  {
    name: "Vignette",
    folderName: "Luminance",
    paramDefs: [
      {
        name: "innerRadius",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.25,
        sliderRange: { min: 0.0, max: 1.0, step: 0.01 },
        isFloat: true,
      },
      {
        name: "outerRadius",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.75,
        sliderRange: { min: 0.1, max: 1.0, step: 0.01 },
        isFloat: true,
      },
    ],
  },
  {
    name: "Histogram Equalization",
    folderName: "Luminance",
    paramDefs: [],
  },

  // COLOR OPERATIONS
  {
    name: "Grayscale",
    folderName: "Color",
    paramDefs: [],
  },
  {
    name: "Saturation",
    folderName: "Color",
    canAnimate: true,
    paramDefs: [
      {
        name: "saturation",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: -1.0, max: 1.0, step: 0.1 },
        isFloat: true,
      },
    ],
  },
  {
    name: "White Balance",
    folderName: "Color",
    paramDefs: [
      {
        name: "white",
        type: GuiConfig.ParamDef.Type.COLOR,
        mustBeOpaque: true,
        defaultVal: [255, 255, 255],
      },
    ],
  },

  // FILTER OPERATIONS
  {
    name: "Gaussian",
    folderName: "Filters",
    canAnimate: true,
    paramDefs: [
      {
        name: "sigma",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 4,
        sliderRange: { min: 1, max: 8 },
      },
    ],
  },
  {
    name: "Sharpen",
    folderName: "Filters",
    paramDefs: [],
  },
  {
    name: "Median",
    folderName: "Filters",
    paramDefs: [
      {
        name: "window radius",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1,
        sliderRange: { min: 1, max: 6 },
      },
    ],
  },
  {
    name: "Bilateral",
    folderName: "Filters",
    paramDefs: [
      {
        name: "sigmaR",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1,
        sliderRange: { min: 1, max: 500 },
      },
      {
        name: "sigmaS",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1,
        sliderRange: { min: 1, max: 18 },
      },
    ],
  },

  // DITHERING OPERATIONS
  {
    name: "Quantize",
    folderName: "Dithering",
    paramDefs: [],
  },
  {
    name: "Random",
    folderName: "Dithering",
    paramDefs: [],
  },
  {
    name: "Floyd-Steinberg",
    folderName: "Dithering",
    funcName: "floydFilter",
    paramDefs: [],
  },
  {
    name: "Ordered",
    folderName: "Dithering",
    paramDefs: [],
  },

  // RESAMPLING OPERATIONS
  {
    name: "Scale",
    folderName: "Resampling",
    paramDefs: [
      {
        name: "ratio",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1.0,
        sliderRange: { min: 0.1, max: 3.0, step: 0.1 },
        isFloat: true,
      },
      sampleModeParam,
    ],
  },

  // COMPOSITE OPERATIONS
  {
    name: "Flow",
    folderName: "Composite",
    numInputs: 1,
    canAnimate: true,
    paramDefs: [
      {
        name: "alpha",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: 0.0, max: 1.0, step: 0.1 },
        isFloat: true,
      },
      sampleModeParam,
      {
        name: "lines file",
        type: GuiConfig.ParamDef.Type.STRING,
        defaultVal: "images/marker.json",
      },
    ],
  },

  // MISC OPERATIONS
  {
    name: "Sparkle",
    folderName: "Misc",
    canAnimate: false, // Uses continuous animation system
    paramDefs: [
      hueParam,
      {
        name: "brightness",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: -0.5, max: 0.5, step: 0.1 },
        isFloat: true,
      },
    ],
  },

  {
    name: "Breathe",
    folderName: "Misc",
    canAnimate: false, // Uses continuous animation system
    paramDefs: [
      {
        name: "intensity",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: 0.0, max: 1.0, step: 0.1 },
        isFloat: true,
      },
    ],
  },

  {
    name: "Ripple",
    folderName: "Misc",
    canAnimate: false, // Uses continuous animation system
    paramDefs: [
      {
        name: "amplitude",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0,
        sliderRange: { min: 0, max: 10 },
      },
      {
        name: "frequency",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 0.0,
        sliderRange: { min: 0, max: 0.5, step: 0.05 },
      },
      {
        name: "speed",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1,
        sliderRange: { min: 1, max: 5 },
      },
    ],
  },

  {
    name: "Wind",
    folderName: "Misc",
    canAnimate: false, // Uses continuous animation system
    paramDefs: [
      {
        name: "speed",
        type: GuiConfig.ParamDef.Type.SLIDER,
        defaultVal: 1,
        sliderRange: { min: 1, max: 5 },
      },
      directionParam,
    ],
  },
]);

GuiConfig.onInit = function () {
  // starter image, if none loaded from url
  if (Gui.historyFilters.length === 0) {
    const pushBaseFilterDef = GuiConfig.filterDefs.find(
      (filterDef) => filterDef.pushBase
    );
    if (pushBaseFilterDef != null) {
      Gui.addHistoryEntry(pushBaseFilterDef);
    }
  }
};

GuiConfig.setupFinished = true;
