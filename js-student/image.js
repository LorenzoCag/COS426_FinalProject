"use strict";

/******************************************************************************
 * PIXEL COLOR                                                                *
 ******************************************************************************/

/** Represents a pixel color. */
class PixelColor {
  /** Enum of possible colorspaces. */
  static Colorspace = class Colorspace extends Enum {
    static HSL = new Colorspace("hsl");
    static RGB = new Colorspace("rgb");
    static XYZ = new Colorspace("xyz");
    static LMS = new Colorspace("lms");
  };

  /**
   * Creates a pixel color.
   * @param {?[number, number, number]} components - The three color components
   *     (default black).
   * @param {?number} alpha - The alpha value (default 1).
   * @param {?PixelColor.Colorspace} colorspace - The colorspace (default RGB).
   */
  constructor(components, alpha, colorspace) {
    const Colorspace = this.constructor.Colorspace;

    if (components == null) {
      // default to black
      components = [0, 0, 0];
    } else {
      assert(Array.isArray(components), "Color components must be an array");
      assert(
        components.length >= 3,
        `PixelColor must have 3 components (got ${components.length})`
      );
    }

    /**
     * The three color components.
     * @type {[number, number, number]}
     * @readonly
     */
    this.data = [components[0], components[1], components[2]];
    // We must manually extract the components because constructing and slicing
    // intermediate arrays seem to be super slow, and colors are very
    // performance-sensitive. Before this change was made, some filters could be
    // 10x slower!

    /**
     * The alpha value.
     * @type {number}
     * @readonly
     */
    this.alpha = alpha ?? 1;
    /**
     * The color space.
     * @type {!PixelColor.Colorspace}
     * @readonly
     */
    this.colorspace = colorspace ?? Colorspace.RGB;
  }

  /**
   * Creates a blank RGB pixel color (black and fully transparent).
   * @constructs PixelColor
   */
  static blank() {
    const Colorspace = this.Colorspace;
    return new this([0, 0, 0], 0, Colorspace.RGB);
  }

  /**
   * Creates an RGB pixel color from a hex string.
   * @constructs PixelColor
   * @param {string} hex - A hex string, with optional leading "#".
   */
  static rgbFromHex(hex) {
    const Colorspace = this.Colorspace;

    assert(
      hex.match(Parser.REGEXP.HEX_STRING_RE) != null,
      `Invalid hex string: ${hex}`
    );

    if (hex.startsWith("#")) hex = hex.slice(1);
    const comps = [];
    let value = parseInt(hex, 16);
    for (let i = 0; i < 3; i++) {
      comps.push((value & 255) / 255);
      value >>= 8;
    }
    comps.reverse();
    return new this(comps, 1, Colorspace.RGB);
  }

  /**
   * Creates a pixel color from an RGB string.
   * @constructs PixelColor
   * @param {string} rgbString - An RGB string, such as "rgb(r,g,b)" or
   *     "rgba(r,g,b,a)".
   */
  static rgbFromString(rgbString) {
    const Colorspace = this.Colorspace;

    const components = Parser.parseFloats(
      rgbString,
      Parser.REGEXP.RGB_CSS_STRING_RE
    );
    assert(components != null, `Invalid RGB string: ${rgbString}`);

    const data = components.map((val) => val / 255);
    const alpha = data[3] ?? 1;
    return new this(data, alpha, Colorspace.RGB);
  }

  /**
   * Returns a copy of this pixel color.
   * @returns {!PixelColor}
   */
  createCopy() {
    return new this.constructor(this.data, this.alpha, this.colorspace);
  }

  // Convenience getters for the components. Will work even if not in RGB
  // colorspace (but will not convert to RGB colorspace).
  get r() {
    return this.data[0];
  }
  get g() {
    return this.data[1];
  }
  get b() {
    return this.data[2];
  }

  #clamp(val) {
    return Math.min(Math.max(0, val), 1);
  }

  /**
   * Returns this color in the "rgb(r,g,b)" or "rgba(r,g,b,a)" format. All the
   * values, including alpha, will be an integer in the range [0, 255].
   * @returns {string}
   */
  toRgbString(includeAlpha = false) {
    const toInt = (comp) => Math.round(this.#clamp(comp) * 255);
    const color = this.toRgb();
    let funcName = "rgb";
    const components = color.data.map((comp) => toInt(comp));
    if (includeAlpha) {
      funcName += "a";
      components.push(toInt(color.alpha));
    }
    return `${funcName}(${components.join(",")})`;
  }

  /**
   * Clamps all the components and the alpha value to be between [0, 1].
   * @returns {!PixelColor} Itself for chaining.
   */
  clamp() {
    this.data = this.data.map((val) => this.#clamp(val));
    this.alpha = this.#clamp(this.alpha);
    return this;
  }

  /** Returns the luminance of this color. */
  luminance() {
    const Colorspace = this.constructor.Colorspace;
    let color = this;
    if (color.colorspace !== Colorspace.RGB) color = color.toRgb();
    const [r, g, b] = color.data;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /** Returns a copy of this color, but inverted. */
  inverted() {
    return new this.constructor(
      this.data.map((value) => 1 - value),
      this.alpha,
      this.colorspace
    );
  }

  /**
   * Checks if two pixel colors are equal.
   * @param {!PixelColor} color
   * @returns {boolean}
   */
  equals(color) {
    if (this === color) return true;
    if (!this.constructor.prototype.isPrototypeOf(color)) return false;
    if (color.colorspace !== this.colorspace) {
      color = color.toColorspace(this.colorspace);
    }
    return (
      this.alpha === color.alpha &&
      this.data.every((val, index) => val === color.data[index])
    );
  }

  /****************************************************************************
   * COLORSPACE CONVERSIONS                                                   *
   ****************************************************************************/

  /**
   * Converts this pixel color to the specified colorspace.
   * @param {!PixelColor.Colorspace} colorspace
   * @returns {!PixelColor} A new pixel color in the specified colorspace.
   */
  toColorspace(colorspace) {
    const data = _PixelColorHelpers.convertColorspace(
      this.colorspace,
      colorspace,
      this.data
    );
    return new this.constructor(data, this.alpha, colorspace);
  }

  /**
   * Converts this pixel color to the HSL colorspace.
   * @returns {!PixelColor} A new pixel color in the HSL colorspace.
   */
  toHsl() {
    const Colorspace = this.constructor.Colorspace;
    return this.toColorspace(Colorspace.HSL);
  }

  /**
   * Converts this pixel color to the RGB colorspace.
   * @returns {!PixelColor} A new pixel color in the RGB colorspace.
   */
  toRgb() {
    const Colorspace = this.constructor.Colorspace;
    return this.toColorspace(Colorspace.RGB);
  }

  /**
   * Converts this pixel color to the XYZ colorspace.
   * @returns {!PixelColor} A new pixel color in the XYZ colorspace.
   */
  toXyz() {
    const Colorspace = this.constructor.Colorspace;
    return this.toColorspace(Colorspace.XYZ);
  }

  /**
   * Converts this pixel color to the LMS colorspace.
   * @returns {!PixelColor} A new pixel color in the LMS colorspace.
   */
  toLms() {
    const Colorspace = this.constructor.Colorspace;
    return this.toColorspace(Colorspace.LMS);
  }

  /****************************************************************************
   * ARITHMETIC OPERATORS                                                     *
   ****************************************************************************/
  // These operations are inlined and unrolled for performance.

  /**
   * Adds the given color to this pixel color.
   * @param {!PixelColor} color
   * @returns {!PixelColor} Itself for chaining.
   */
  add(color) {
    assert(
      this.colorspace === color.colorspace,
      "Colorspaces must be the same"
    );
    this.data[0] += color.data[0];
    this.data[1] += color.data[1];
    this.data[2] += color.data[2];
    return this;
  }

  /**
   * Subtracts the given color from this pixel color.
   * @param {!PixelColor} color
   * @returns {!PixelColor} Itself for chaining.
   */
  subtract(color) {
    assert(
      this.colorspace === color.colorspace,
      "Colorspaces must be the same"
    );
    this.data[0] -= color.data[0];
    this.data[1] -= color.data[1];
    this.data[2] -= color.data[2];
    return this;
  }

  /**
   * Multiplies each color component by the corresponding factors.
   * @param {[number, number, number]} factors
   * @returns {!PixelColor} Itself for chaining.
   */
  multiplyEachBy(factors) {
    assert(Array.isArray(factors), "Given factors must be an array");
    for (let i = 0; i < 3; i++) {
      const factor = factors[i];
      assert(factor != null, "Must have 3 factors");
      this.data[i] *= factor;
    }
    return this;
  }

  /**
   * Multiplies each color component by the given factor.
   * @param {number} factor
   * @returns {!PixelColor} Itself for chaining.
   */
  multiplyBy(factor) {
    this.data[0] *= factor;
    this.data[1] *= factor;
    this.data[2] *= factor;
    return this;
  }

  /**
   * Divides each color component by the corresponding factors.
   * @param {[number, number, number]} factors
   * @returns {!PixelColor} Itself for chaining.
   */
  divideEachBy(factors) {
    assert(Array.isArray(factors), "Given factors must be an array");
    for (let i = 0; i < 3; i++) {
      const factor = factors[i];
      assert(factor != null, "Must have 3 factors");
      assert(factor !== 0, "Cannot divide by 0");
      this.data[i] /= factor;
    }
    return this;
  }

  /**
   * Divides each color component by the given factor.
   * @param {number} factor
   * @returns {!PixelColor} Itself for chaining.
   */
  divideBy(factor) {
    assert(factor !== 0, "Cannot divide by 0");
    this.data[0] /= factor;
    this.data[1] /= factor;
    this.data[2] /= factor;
    return this;
  }
}

/******************************************************************************
 * IMAGE                                                                      *
 ******************************************************************************/

/** Represents an image. */
class Image426 {
  // used to be called Image, but conflicts with JavaScript's builtin Image
  // constructor
  // https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/Image

  #data;

  /**
   * Creates an image.
   * @param {number} width
   * @param {number} height
   * @param {?(Array|Uint8ClampedArray)} data - The pixel data.
   * @param {?string} fileName - The image filename.
   */
  constructor(width, height, data, fileName) {
    assert(width != null && height != null, "Image requires width and height");

    /**
     * The width of the image.
     * @type {number}
     * @readonly
     */
    this.width = width;
    /**
     * The height of the image.
     * @type {number}
     * @readonly
     */
    this.height = height;

    if (!data) {
      data = this.constructor.createData(width, height);
    } else {
      // convert to clamped array
      data = new Uint8ClampedArray(data);
    }
    assert(
      data.length === width * height * 4,
      "Image pixel data has the wrong length"
    );

    /**
     * The image pixel data.
     * @type {!Uint8ClampedArray}
     * @private
     */
    this.#data = data;

    /**
     * The image filename.
     * @type {?string}
     * @readonly
     */
    this.fileName = fileName ?? null;
  }

  /**
   * Creates a data array for an image of the given dimensions.
   * @param {number} width
   * @param {number} height
   * @returns {!Uint8ClampedArray}
   */
  static createData(width, height) {
    return new Uint8ClampedArray(width * height * 4);
  }

  /**
   * Creates an image that is all white.
   * @constructs Image426
   * @param {number} width
   * @param {number} height
   */
  static createWhite(width, height) {
    const data = this.createData(width, height);
    // initial value is white and fully opaque
    data.fill(255);
    return new this(width, height, data);
  }

  /**
   * Fills the entire image with the given color.
   * @param {!PixelColor} color
   */
  fill(color) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.setPixel(x, y, color);
      }
    }
  }

  /** Clears the image so that it is all blank (black and transparent). */
  clear() {
    // reset the data to all 0
    this.#data.fill(0);
  }

  /**
   * Returns a copy of this image.
   * @returns {!Image426}
   */
  createCopy() {
    // create copy of data
    const data = new Uint8ClampedArray(this.#data);
    return new this.constructor(this.width, this.height, data, this.fileName);
  }

  /**
   * Sets the image data (such as from a canvas context)
   * @param {!Uint8ClampedArray} data - An array-like object containing the
   *     image data.
   */
  setImageData(data) {
    assert(
      data.length === this.width * this.height * 4,
      "Image pixel data has the wrong length"
    );
    this.#data = new Uint8ClampedArray(data);
  }

  /**
   * Gets the ImageData object for this image.
   * @returns {!ImageData}
   */
  getImageData() {
    return new ImageData(this.#data, this.width, this.height);
  }

  /**
   * Returns whether the given coordinates (x,y) are valid in the image, where
   * (0,0) is the top left of the image.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  validCoords(x, y) {
    return 0 <= x && x < this.width && 0 <= y && y < this.height;
  }

  /**
   * Returns the 1D index for the pixel at coordinate (x,y).
   * @param {number} x
   * @param {number} y
   * @returns {number} The 1D index into `this.#data`.
   */
  #pixelIndex(x, y) {
    // if these are non-integers, indexing gets messed up
    x = Math.round(x);
    y = Math.round(y);
    return 4 * (y * this.width + x);
  }

  /**
   * Gets the pixel color at coordinate (x,y), where (0,0) is the top left of
   * the image.
   * @param {number} x
   * @param {number} y
   * @returns {!PixelColor} The pixel color in the RGB colorspace.
   */
  getPixel(x, y) {
    if (!this.validCoords(x, y)) {
      return PixelColor.blank();
    }

    const index = this.#pixelIndex(x, y);
    // manually written out for performance
    return new PixelColor(
      [
        this.#data[index] / 255,
        this.#data[index + 1] / 255,
        this.#data[index + 2] / 255,
      ],
      this.#data[index + 3] / 255,
      PixelColor.Colorspace.RGB
    );
  }

  /**
   * Sets the pixel color at coordinate (x,y), where (0,0) is the top left of
   * the image.
   * @param {number} x
   * @param {number} y
   * @param {!PixelColor} color
   */
  setPixel(x, y, color) {
    if (!this.validCoords(x, y)) return;

    if (color.colorspace !== PixelColor.Colorspace.RGB) {
      color = color.toRgb();
    }

    const index = this.#pixelIndex(x, y);
    // manually written out for performance
    this.#data[index] = color.data[0] * 255;
    this.#data[index + 1] = color.data[1] * 255;
    this.#data[index + 2] = color.data[2] * 255;
    this.#data[index + 3] = color.alpha * 255;
  }
}

/******************************************************************************
 * HELPERS                                                                    *
 * You don't need to look at anything below this.                             *
 ******************************************************************************/

/**
 * Helpers for `PixelColor`.
 * @namespace
 */
var _PixelColorHelpers = _PixelColorHelpers || {};

/**
 * Multiplies a matrix and a vector.
 * @param {!Array<!Array<number>>} matrix - An m x n matrix.
 * @param {!Array<number>} vector - An n x 1 vector.
 * @returns {!Array<number>} An m x 1 vector resulting from the multiplication.
 */
_PixelColorHelpers.matrixMul = function (matrix, vector) {
  const m = matrix.length;
  assert(m !== 0, "Matrix cannot have 0 rows");
  const n = matrix[0].length;
  assert(n !== 0, "Matrix cannot have 0 columns");
  assert(
    matrix.every((row) => row.length === n),
    "Matrix rows must have the same number of columns"
  );
  assert(vector.length === n, "Vector must have length n");
  const result = [];
  for (let r = 0; r < m; r++) {
    const rowVector = matrix[r];
    let value = 0;
    for (let c = 0; c < n; c++) {
      value += rowVector[c] * vector[c];
    }
    result.push(value);
  }
  return result;
};

_PixelColorHelpers.CONVERSION_MATRICES = {
  xyzToRgb: [
    [3.240479, -1.53715, -0.498535],
    [-0.969256, 1.875992, 0.041556],
    [0.055648, -0.204043, 1.057311],
  ],
  rgbToXyz: [
    [0.4124, 0.3576, 0.1805],
    [0.2126, 0.7152, 0.0722],
    [0.0193, 0.1192, 0.9502],
  ],
  lmsToXyz: [
    [1.8599364, -1.1293816, 0.2198974],
    [0.3611914, 0.6388125, 0.0000064],
    [0, 0, 1.0890636],
  ],
  xyzToLms: [
    [0.40024, 0.7076, -0.08081],
    [-0.2263, 1.16532, 0.0457],
    [0, 0, 0.91822],
  ],
};

/**
 * Converts the given color components from one colorspace to another.
 * @param {!PixelColor.Colorspace} fromSpace
 * @param {!PixelColor.Colorspace} toSpace
 * @param {[number, number, number]} data
 * @returns {[number, number, number]} The converted components.
 */
_PixelColorHelpers.convertColorspace = function (fromSpace, toSpace, data) {
  if (fromSpace === toSpace) return data;

  const { HSL, RGB, XYZ, LMS } = PixelColor.Colorspace;

  // one step conversions: HSL <-> RGB <-> XYZ <-> LMS
  const CONVERSION_ORDER = [HSL, RGB, XYZ, LMS];

  // handle the one step conversions, but fall through to the end if a step must
  // be taken in the middle
  if (toSpace === HSL) {
    if (fromSpace === RGB) {
      const [r, g, b] = data;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);

      let h;
      let s;
      const lum = (max + min) / 2;
      if (max === min) {
        // achromatic
        h = 0;
        s = 0;
      } else {
        const diff = max - min;
        s = diff / (lum > 0.5 ? 2 - max - min : max + min);
        switch (max) {
          case r:
            h = (g - b) / diff + (g < b ? 6 : 0);
            break;
          case g:
            h = (b - r) / diff + 2;
            break;
          case b:
            h = (r - g) / diff + 4;
            break;
        }
        h /= 6;
      }

      return [h, s, lum];
    }
  } else if (toSpace === RGB) {
    if (fromSpace === HSL) {
      const [h, s, lum] = data;

      const m2 = lum > 0.5 ? lum + s - lum * s : lum * (s + 1);
      const m1 = lum * 2 - m2;

      function hueToRgb(hue) {
        if (hue < 0) {
          hue += 1;
        } else if (hue > 1) {
          hue -= 1;
        }
        const hue6 = hue * 6;
        if (hue6 < 1) return m1 + (m2 - m1) * hue6;
        if (hue6 < 3) return m2;
        if (hue6 < 4) return m1 + (m2 - m1) * (4 - hue6);
        return m1;
      }

      return [h + 1 / 3, h, h - 1 / 3].map((hue) => hueToRgb(hue));
    } else if (fromSpace === XYZ) {
      return this.matrixMul(this.CONVERSION_MATRICES.xyzToRgb, data);
    }
  } else if (toSpace === XYZ) {
    if (fromSpace === RGB) {
      return this.matrixMul(this.CONVERSION_MATRICES.rgbToXyz, data);
    } else if (fromSpace === LMS) {
      return this.matrixMul(this.CONVERSION_MATRICES.lmsToXyz, data);
    }
  } else if (toSpace === LMS) {
    if (fromSpace === XYZ) {
      return this.matrixMul(this.CONVERSION_MATRICES.xyzToLms, data);
    }
  }

  // find which colorspace can be directly converted to `toSpace`
  let passedFromSpace = false;
  let neighborSpace = null;
  for (const [i, space] of Array.enumerated(CONVERSION_ORDER)) {
    if (space === fromSpace) {
      passedFromSpace = true;
    } else if (space === toSpace) {
      let neighborIndex;
      if (passedFromSpace) {
        // neighbor on the left
        neighborIndex = i - 1;
      } else {
        // neighbor on the right
        neighborIndex = i + 1;
      }
      neighborSpace = CONVERSION_ORDER[neighborIndex];
    }
  }
  assert(neighborSpace, `Invalid colorspace: ${toSpace}`);
  assert(passedFromSpace, `Invalid colorspace: ${fromSpace}`);

  // convert to the neighbor first, then try again
  const convertedData = this.convertColorspace(fromSpace, neighborSpace, data);
  return this.convertColorspace(neighborSpace, toSpace, convertedData);
};
