"use strict";

/**
 * Config for the GUI.
 * @namespace
 */
var GuiConfig = GuiConfig || {};

/** Defines a parameter for a filter/command. */
GuiConfig.ParamDef = class {
  /** Enum of possible parameter types. */
  static Type = class ParamType extends Enum {
    static BOOLEAN = new ParamType("boolean");
    static STRING = new ParamType("string");
    static COLOR = new ParamType("color");
    static DROPDOWN = new ParamType("dropdown");
    static SLIDER = new ParamType("slider");
  };

  /**
   * Creates a parameter definition.
   * @param {!Object} options
   * @param {string} options.name - The name of the parameter.
   * @param {!GuiConfig.ParamDef.TYPE} options.type - The parameter type.
   * @param {*} options.defaultVal - The default value.
   * @param {?boolean} options.mustBeOpaque - Whether the color must be opaque
   *     (alpha = 1) (default false).
   * @param {?Array<string>} options.dropdownOptions - The options for dropdown
   *     types.
   * @param {?Object} options.sliderRange - The range for slider types.
   * @param {number} options.sliderRange.min - The minimum value.
   * @param {number} options.sliderRange.max - The maximum value.
   * @param {?number} options.sliderRange.step - The step value.
   * @param {?boolean} options.isFloat - Whether the slider accepts float values
   *     (default false, but will be set to true if `sliderRange` contains
   *     floats).
   */
  constructor(options) {
    assert(options, "ParamDef requires options");
    assert(options.name, "ParamDef requires a name");
    assert(options.type, `${options.name}: ParamDef requires a type`);

    const ParamType = this.constructor.Type;

    /**
     * The name of the parameter.
     * @type {string}
     * @readonly
     */
    this.name = options.name;

    /**
     * The parameter type.
     * @type {!GuiConfig.ParamDef.Type}
     * @readonly
     */
    this.type = options.type;

    /**
     * The default value.
     * @readonly
     */
    this.defaultVal = options.defaultVal ?? null;

    const valForType = (value, ...types) => {
      if (value == null) return null;
      return types.includes(this.type) ? value : null;
    };

    /**
     * Whether the color must be opaque (alpha = 1).
     * @type {?boolean}
     * @type
     */
    this.mustBeOpaque = valForType(
      options.mustBeOpaque ?? false,
      ParamType.COLOR
    );

    /**
     * The options for dropdown types.
     * @type {?Array<string>}
     * @readonly
     */
    this.dropdownOptions = valForType(
      options.dropdownOptions,
      ParamType.DROPDOWN
    );

    /**
     * The range for slider types.
     * @type {{min: number, max: number, step: number}}
     * @readonly
     */
    this.sliderRange = valForType(options.sliderRange, ParamType.SLIDER);

    /**
     * Whether the slider accepts float values.
     * @type {?boolean}
     * @readonly
     */
    this.isFloat = valForType(options.isFloat ?? false, ParamType.SLIDER);

    /**
     * The passed in options.
     * @type {!Object}
     */
    this.options = options;

    // validate values and options
    if (this.type === ParamType.BOOLEAN) {
      assert(
        this.defaultVal != null,
        `${this.name}: Boolean param requires default value`
      );
    } else if (this.type === ParamType.STRING) {
      if (this.defaultVal == null) {
        // make the default an empty string
        this.defaultVal = "";
      }
    } else if (this.type === ParamType.COLOR) {
      assert(
        this.defaultVal,
        `${this.name}: Color param requires default value`
      );
      const isArray = Array.isArray(this.defaultVal);
      if (this.mustBeOpaque) {
        // don't allow alpha value
        assert(
          isArray && this.defaultVal.length === 3,
          `${this.name}: Color param default must be an array of 3 values`
        );
      } else {
        // allow optional alpha value
        assert(
          isArray && [3, 4].includes(this.defaultVal.length),
          `${this.name}: Color param default must be an array of 3 or 4 values`
        );
      }
      assert(
        this.defaultVal.every((val) => 0 <= val && val <= 255),
        `${this.name}: Color param default has invalid value(s) (must be ` +
          "between [0, 255])"
      );
    } else if (this.type === ParamType.DROPDOWN) {
      assert(
        this.dropdownOptions &&
          Array.isArray(this.dropdownOptions) &&
          this.dropdownOptions.length > 0,
        `${this.name}: Dropdown param requires array of dropdown options`
      );
      if (this.defaultVal == null) {
        // choose the first one as the default option
        this.defaultVal = this.dropdownOptions[0];
      } else {
        assert(
          this.dropdownOptions.includes(this.defaultVal),
          `${this.name}: Dropdown param default must be in the given options`
        );
      }
    } else if (this.type === ParamType.SLIDER) {
      assert(this.sliderRange, `${this.name}: Slider param requires range`);
      const { min, max } = this.sliderRange;
      assert(
        min != null && max != null,
        `${this.name}: Slider param range must have \`min\` and \`max\` values`
      );
      assert(
        min < max,
        `${this.name}: Slider param range min must be smaller than max`
      );
      assert(
        this.defaultVal != null,
        `${this.name}: Slider param requires default value`
      );
      assert(
        min <= this.defaultVal && this.defaultVal <= max,
        `${this.name}: Slider param default value must be within the range`
      );
      if (!this.isFloat) {
        // all values must be integers; otherwise, set `isFloat = true`
        if (
          ![min, max, this.sliderRange.step, this.defaultVal].every(
            (val) => val == null || Number.isInteger(val)
          )
        ) {
          this.isFloat = true;
        }
      }
      if (this.sliderRange.step == null) {
        // assign default value for step
        if (!this.isFloat) {
          this.sliderRange.step = 1;
        } else {
          this.sliderRange.step = 0.1;
        }
      } else {
        assert(
          this.sliderRange.step > 0,
          `${this.name}: Slider param step must be positive`
        );
      }
      // could also make sure default value is a multiple of `step` away from
      // `min`, but that's a little unnecessary
    }
  }

  /**
   * Constructs `ParamDef` objects from an array of regular objects.
   * @param {?Array<?Object>} paramDefs
   * @returns {!Array<!GuiConfig.ParamDef>} The parameter definitions.
   */
  static fromArray(paramDefs) {
    if (!paramDefs) return [];
    const seenNames = new Set();
    return paramDefs.flatMap((options) => {
      if (!options) return [];
      const paramDef = new this(options);
      const name = paramDef.name;
      assert(
        !seenNames.has(name),
        `Parameter names must be unique ("${name}" seen multiple times)`
      );
      seenNames.add(name);
      return [paramDef];
    });
  }
};

/** Defines a filter/command in the GUI. */
GuiConfig.FilterDef = class {
  /**
   * Creates a filter (or command) definition.
   * @param {!Object} options
   * @param {string} options.name - The name of the command.
   * @param {?boolean} options.isGlobal - Whether this command is global (only
   *     one instance before the "History" folder) (default false).
   * @param {?boolean} options.isControls - Whether this global command is a
   *     collection of controls (each param gets their own command in the URL)
   *     (default false).
   * @param {?boolean} options.isHidden - Whether this command is hidden from
   *     the GUI selection (default false; true if `isGlobal` is true).
   * @param {?string} options.folderName - The name of the folder the command
   *     belongs to.
   * @param {?boolean} options.pushBase - Whether this command is to push a base
   *     (default false).
   * @param {?boolean} options.deleteBelow - Whether instances of this filter
   *     should delete all history below it (default false; true if `pushBase`
   *     is true).
   * @param {?boolean} options.batchMode - Whether this command is to enter
   *     batch mode (default false).
   * @param {?boolean} options.animationMode - Whether this command is to enter
   *     animation mode (default false).
   * @param {?boolean} options.isFilter - Whether this command represents a
   *     filter (default true; false if `hidden`, `batchMode`, or `animation` is
   *     true).
   * @param {?number} options.numInputs - The number of inputs this filter
   *     accepts from the base stack (default 1).
   * @param {?Function} options.applyFunc - The function for applying this
   *     filter or command. (If `batchMode` or `animation` is true, has a
   *     default value.)
   * @param {?boolean} options.canAnimate - Whether this filter can animate
   *     (default false).
   * @param {?Function} options.filterFunc - The function to run to apply this
   *     filter. Defaults to `Filters[funcName]` if not given.
   * @param {?string} options.funcName - The name of the associated filter
   *     function. Has a default generated from `name` if not given.
   * @param {?Array<?Object>} options.paramDefs - The parameter definition
   *     options.
   * @param {?Array<{label: string, func: Function}>} options.buttons - Buttons
   *     to place at the bottom of this command.
   */
  constructor(options) {
    assert(options, "FilterDef requires options");
    assert(options.name, "FilterDef requires a name");

    /**
     * The name of the filter.
     * @type {string}
     * @readonly
     */
    this.name = options.name;

    /**
     * Whether this command is global (only one instance before the "History"
     * folder).
     * @type {boolean}
     * @readonly
     */
    this.isGlobal = options.isGlobal ?? false;

    /**
     * Whether this global command is a collection of controls (each param gets
     * their own command in the URL).
     * @type {boolean}
     * @readonly
     */
    this.isControls = this.isGlobal && (options.isControls ?? false);

    /**
     * Whether this command is hidden from the GUI.
     * @type {boolean}
     * @readonly
     */
    this.isHidden = this.isGlobal || (options.isHidden ?? false);

    /**
     * A folder name for the filter to be grouped in.
     * @type {?string}
     * @readonly
     */
    this.folderName = options.folderName ?? null;

    /**
     * Whether this command is to push a base.
     * @type {boolean}
     * @readonly
     */
    this.pushBase = options.pushBase ?? false;
    // for our contexts, a "base" is an image in A0/A1 and a mesh in A2/A4

    /**
     * Whether instances of this filter should delete all history below it.
     * @type {boolean}
     * @readonly
     */
    this.deleteBelow = options.deleteBelow ?? this.pushBase;

    /**
     * Whether this command is to enter batch mode.
     * @type {boolean}
     * @readonly
     */
    this.batchMode = options.batchMode ?? false;

    /**
     * Whether this command is to enter animation mode.
     * @type {boolean}
     * @readonly
     */
    this.animationMode = options.animationMode ?? false;

    let isFilter = options.isFilter;
    if (this.hidden) {
      assert(!options.isFilter, `${this.name}: Hidden command is not a filter`);
      isFilter = false;
    } else if (this.batchMode || this.animationMode) {
      assert(
        !options.isFilter,
        `${this.name}: Batch and animation modes are not filters`
      );
      isFilter = false;
    }

    /**
     * Whether this command represents a filter.
     * @type {boolean}
     * @readonly
     */
    this.isFilter = isFilter ?? true;

    /**
     * The number of image inputs this filter accepts from the stack.
     * @type {number}
     * @readonly
     */
    this.numInputs = options.numInputs ?? 1;

    let applyFunc = options.applyFunc ?? null;
    if (applyFunc == null) {
      // set defaults
      if (this.batchMode) {
        applyFunc = function () {
          const enableAnimation = Main.animatedValFound;
          window.open("batch.html?" + Gui.buildUrl(enableAnimation));
        };
      } else if (this.animationMode) {
        applyFunc = function () {
          const enableAnimation = true;
          window.open("batch.html?" + Gui.buildUrl(enableAnimation));
        };
      }
    }

    /**
     * The function for applying this filter or command.
     * @type {?Function}
     * @readonly
     */
    this.applyFunc = applyFunc;

    /**
     * Whether the filter can animate.
     * @type {boolean}
     * @readonly
     */
    this.canAnimate = options.canAnimate ?? false;

    let filterFunc = null;
    let funcName = null;
    if (!this.pushBase && this.isFilter) {
      filterFunc = options.filterFunc;
      if (filterFunc != null) {
        funcName = filterFunc.name;
        if (!funcName || funcName === "filterFunc") {
          // anonymous function
          funcName = `${this.name} filter function`;
        }
      } else {
        funcName = options.funcName;
        if (funcName == null) {
          // make the name camel case
          funcName = this.name
            .split(" ")
            .map((word, index) => {
              if (index === 0) return word.toLowerCase();
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join("");
          if (!funcName.endsWith("Filter")) {
            funcName += "Filter";
          }
        }
        filterFunc = Filters[funcName];
        assert(filterFunc, `${this.name}: Invalid filter func: ${funcName}`);
      }
    }

    /**
     * The function to apply this filter.
     *
     * `null` if not a filter.
     * @type {?Function}
     * @readonly
     */
    this.filterFunc = filterFunc;

    /**
     * The name of the associated filter function.
     *
     * `null` if not a filter.
     * @type {?string}
     * @readonly
     */
    this.funcName = funcName;

    /**
     * The parameter definitions.
     * @type {?Array<!GuiConfig.ParamDef>}
     * @readonly
     */
    this.paramDefs = GuiConfig.ParamDef.fromArray(options.paramDefs);

    this.paramDefsByName = Object.fromEntries(
      this.paramDefs.map((paramDef, index) => [
        paramDef.name,
        { index, def: paramDef },
      ])
    );

    /**
     * The buttons at the bottom of this command.
     * @type {!Array<{label: string, func: Function}}
     * @readonly
     */
    this.buttons = (options.buttons ?? []).flatMap(({ label, func }) =>
      label == null || func == null ? [] : [{ label, func }]
    );

    delete options.paramDefs;
    /**
     * The passed in options (except the parameter definitions).
     * @type {!Object}
     */
    this.options = options;

    if (this.canAnimate) {
      // ensure that there's exactly one slider that can be animated
      let seenSlider = false;
      for (const paramDef of this.paramDefs) {
        if (paramDef.type === GuiConfig.ParamDef.Type.SLIDER) {
          assert(
            !seenSlider,
            `${this.name}: A filter that can animate can only have one slider`
          );
          seenSlider = true;
        }
      }
      assert(
        seenSlider,
        `${this.name}: A filter that can animate must have a slider`
      );
    }
  }

  /**
   * Constructs `FilterDef` objects from an array of regular objects.
   * @param {?Array<?Object>} filterDefs
   * @returns {!Array<!GuiConfig.FilterDef>} The filter definitions.
   */
  static fromArray(filterDefs) {
    if (!filterDefs) return [];
    const seenNames = new Set();
    const seenControlNames = new Set();
    const validFilterDefs = filterDefs.flatMap((options) => {
      if (!options) return [];
      const filterDef = new this(options);
      const name = filterDef.name;
      // doesn't HAVE TO be unique here, but throw this error anyway
      assert(
        !seenNames.has(name),
        `Filter names should be unique ("${name}" seen multiple times)`
      );
      seenNames.add(name);
      if (filterDef.isGlobal && filterDef.isControls) {
        for (const paramDef of filterDef.paramDefs) {
          const controlName = paramDef.name;
          assert(
            !seenControlNames.has(controlName),
            "Control names (global filter param) should be unique " +
              `("${controlName}" seen multiple times)`
          );
          seenControlNames.add(controlName);
        }
      }
      return [filterDef];
    });
    // check if control names overshadow a filter
    for (const controlName of seenControlNames) {
      assert(
        !seenNames.has(controlName),
        `Control name overshadows a filter: ${controlName}`
      );
    }
    return validFilterDefs;
  }

  /**
   * Gets the definition of the specified parameter.
   * @param {string} paramName - The name of the parameter.
   * @returns {?GuiConfig.ParamDef} The parameter definition, or `null` if not
   *     found.
   */
  getParamDef(paramName) {
    const paramInfo = this.paramDefsByName[paramName];
    if (paramInfo == null) return null;
    return paramInfo.def;
  }

  /**
   * Gets the index of the specified parameter.
   * @param {string} paramName - The name of the parameter.
   * @returns {number} The index, or -1 if not found.
   */
  getParamIndex(paramName) {
    const paramInfo = this.paramDefsByName[paramName];
    if (paramInfo == null) return -1;
    return paramInfo.index;
  }

  /**
   * Gets the value at the index associated with the specified parameter.
   * @param {!Array} array - A parallel array with the parameters of this
   *     filter.
   * @param {string} paramName - The name of the parameter.
   * @returns {*} The value.
   */
  getParamValue(array, paramName) {
    const index = this.getParamIndex(paramName);
    assert(
      index !== -1,
      `Filter "${this.name}" does not have a parameter "${paramName}"`
    );
    return array[index];
  }

  /**
   * Gets the param values in the given array.
   * @param {!Array} array - A parallel array with the parameters of this
   *     filter.
   * @returns {!Object<string, *>} A mapping of param names to values. Will
   *     include all params, even if they are not in the array.
   */
  getParamValues(array) {
    return Object.fromEntries(
      this.paramDefs.map((paramDef, i) => [paramDef.name, array[i]])
    );
  }
};

/** Checks that `guiSetup.js` ran and finished the setup. */
GuiConfig.checkSetup = function () {
  // `guiSetup.js` should at least define the filter defs
  return GuiConfig.setupFinished && GuiConfig.filterDefs != null;
};
