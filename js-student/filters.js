"use strict";

/**
 * Available filters.
 * @namespace
 */
var Filters = Filters || {};

/******************************************************************************
 * Helper functions                                                           *
 ******************************************************************************/

/**
 * Clamps the given value to the range [min, max].
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const clamp = function (val, min, max) {
  if (val < min) return min;
  if (val > max) return max;
  return val;
};

/**
 * Extracts vertex coordinates from a string.
 * @param {string} coordsString - A string in the format "x00y00x00y00..." where
 *     the "00"s represent any integer.
 * @returns {!Array<{x: number, y: number}>} An array of extracted coordinates.
 */
const stringToCoords = function (coordsString) {
  const centers = [];
  for (const coordString of coordsString.split("x")) {
    const coords = coordString.split("y");
    const x = parseInt(coords[0]);
    const y = parseInt(coords[1]);
    if (!isNaN(x) && !isNaN(y)) {
      centers.push({ x, y });
    }
  }
  return centers;
};

/**
 * Blends two scalar values according to the given `alpha`.
 *
 * In image blending, `end` should be the foreground (upper layer) and `start`
 * should be the background (lower layer).
 * @param {number} start
 * @param {number} end
 * @param {number} alpha
 * @returns {number} The blended value.
 */
const blend = function (start, end, alpha) {
  return start * (1 - alpha) + end * alpha;
};

const contrast = function (value, K, ratio) {
  return (value - K / 2) * Math.tan((ratio + 1) * (Math.PI / 4)) + K / 2;
};

const gammaCorrect = function (value, gamma) {
  return value ** (Math.E ** Math.log(gamma));
};

const saturate = function (ratio, value, luminance) {
  return value + (value - luminance) * ratio;
};

const convolve = function (pixels, kernel) {
  let values = [0, 0, 0];

  for (let i = 0; i < pixels.length; i++) {
    for (let j = 0; j < pixels[0].length; j++) {
      values[0] += pixels[i][j].data[0] * kernel[i][j];
      values[1] += pixels[i][j].data[1] * kernel[i][j];
      values[2] += pixels[i][j].data[2] * kernel[i][j];
    }
  }

  return values;
};

const mediate = function (values) {
  values.sort();

  if (values.length % 2 == 0) {
    return (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  } else {
    return values[Math.trunc(values.length / 2)];
  }
};

/******************************************************************************
 * Filters                                                                    *
 ******************************************************************************/

/**
 * Changes the brightness of an image.
 *
 * Blends the original colors with a black or white color according to the given
 * ratio: when `ratio > 0`, blend with white to make it brighter, and when
 * `ratio < 0`, blend with black to make it darker. At the extremes of -1 and 1,
 * the image should be completely black and completely white, respectively.
 * @param {!Image426} image
 * @param {number} ratio - A value in the range [-1, 1].
 * @returns {!Image426} The given image (now modified).
 */
Filters.brightnessFilter = function (image, ratio) {
  let alpha;
  let dirLuminance;
  if (ratio < 0.0) {
    // blend with black
    alpha = 1 + ratio;
    dirLuminance = 0;
  } else {
    // blend with white
    alpha = 1 - ratio;
    dirLuminance = 1;
  }

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const blended = color.data.map((value) =>
        blend(dirLuminance, value, alpha)
      );
      image.setPixel(x, y, new PixelColor(blended, color.alpha).clamp());
    }
  }

  return image;
};

/**
 * Changes the contrast of an image.
 *
 * Interpolates between a constant gray image (ratio = -1) with the average
 * luminance and the original image (ratio = 0).
 * @param {!Image426} image
 * @param {number} ratio - A value in the range [-1, 1].
 * @returns {!Image426} The given image (now modified).
 */
Filters.contrastFilter = function (image, ratio) {
  const K = 1.0; // maximum pixel value

  // Formula:
  //   value = (value - K/2) * (tan ((contrast + 1) * PI/4)) + K/2;
  // Reference: https://en.wikipedia.org/wiki/Image_editing#Contrast_change_and_brightening
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const contrasted = color.data.map((value) => contrast(value, K, ratio));
      image.setPixel(x, y, new PixelColor(contrasted, color.alpha).clamp());
    }
  }

  return image;
};

/**
 * Applies a gamma correction to the image.
 * @param {!Image426} image
 * @param {number} lnOfGamma - The natural log of gamma.
 * @returns {!Image426} The given image (now modified).
 */
Filters.gammaFilter = function (image, lnOfGamma) {
  const gamma = Math.exp(lnOfGamma);

  // Formula:
  //   value = value ^ gamma
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const gammaCorrected = color.data.map((value) =>
        gammaCorrect(value, gamma)
      );
      image.setPixel(x, y, new PixelColor(gammaCorrected, color.alpha).clamp());
    }
  }

  return image;
};

/**
 * Darkens the corners of the image, simulating the effect of lenses with very
 * wide apertures.
 *
 * The effect will be perfectly clear up to `innerR`, perfectly dark (black)
 * beyond `outerR`, and smoothly increase in darkness within the enclosed ring.
 * Both `innerR` and `outerR` are specified as multiples of half the length of
 * the image diagonal (so 1.0 is the distance from the image center to the
 * corner). The vignette will form a perfect circle.
 * @param {!Image426} image
 * @param {number} innerR - The inner radius ratio in the range [0, 1].
 * @param {number} outerR - The outer radius ratio in the range [0, 1].
 * @returns {!Image426} The given image (now modified).
 */
Filters.vignetteFilter = function (image, innerR, outerR) {
  // Ensure that `innerR` is at least 0.1 smaller than outerR
  innerR = clamp(innerR, 0, outerR - 0.1);

  const imageCenter = [image.width / 2, image.height / 2];
  const halfDiagonal = Math.sqrt(image.width ** 2 + image.height ** 2) / 2;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let distanceToCenter =
        Math.sqrt((x - imageCenter[0]) ** 2 + (y - imageCenter[1]) ** 2) /
        halfDiagonal;

      if (distanceToCenter > outerR) {
        image.setPixel(
          x,
          y,
          new PixelColor([0, 0, 0], image.getPixel(x, y).alpha)
        );
      } else if (distanceToCenter > innerR && distanceToCenter < outerR) {
        let multiplier = 1 - (distanceToCenter - innerR) / (outerR - innerR);
        image.setPixel(x, y, image.getPixel(x, y).multiplyBy(multiplier));
      } else {
        continue;
      }
    }
  }

  return image;
};

/**
 * Increases the contrast of the image through a histogram equalization of its
 * lightness channel.
 *
 * The histogram of the resulting image's L channel in its HSL representation
 * will be flat.
 * @param {!Image426} image
 * @returns {!Image426} The given image (now modified).
 */
Filters.histogramEqualizationFilter = function (image) {
  const w = image.width,
    h = image.height;
  const N = w * h;
  const B = 256; // bins
  const hist = new Array(B).fill(0);

  // build L channel
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hsl = image.getPixel(x, y).toHsl();
      const L = hsl.data[2]; // [H,S,L]
      const bin = clamp(Math.floor(L * (B - 1)), 0, B - 1);
      hist[bin]++;
    }
  }

  // CDF
  const cdf = new Array(B).fill(0);
  let run = 0;
  for (let i = 0; i < B; i++) {
    run += hist[i];
    cdf[i] = run / N;
  }

  // Remap L
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      //
      const hsl = image.getPixel(x, y).toHsl();
      const L = hsl.data[2];
      const bin = clamp(Math.floor(L * (B - 1)), 0, B - 1);
      hsl.data[2] = cdf[bin];
      const out = hsl.toRgb().clamp();
      out.alpha = image.getPixel(x, y).alpha;
      image.setPixel(x, y, out);
    }
  }

  return image;
};

/**
 * Sets each pixel in the image to its luminance (makes it grayscale).
 * @param {!Image426} image
 * @returns {!Image426} The given image (now modified).
 */
Filters.grayscaleFilter = function (image) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const luminance = color.luminance();
      image.setPixel(
        x,
        y,
        new PixelColor([luminance, luminance, luminance], color.alpha)
      );
    }
  }
  return image;
};

/**
 * Adjusts the saturation of the image.
 *
 * Interpolates between a gray level version of the image (ratio = -1) and the
 * original image (ratio = 0), based on each pixel's distance from its
 * luminance.
 * @param {!Image426} image
 * @param {number} ratio
 * @returns {!Image426} The given image (now modified).
 */
Filters.saturationFilter = function (image, ratio) {
  // Note: `ratio` in this assignment is equal to `1 - alpha`, where `alpha` is
  // the blending factor referenced in the Graphica Obscura method.
  // Reference: http://www.graficaobscura.com/interp/index.html
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const luminance = color.luminance();
      const saturated = color.data.map((value) =>
        saturate(ratio, value, luminance)
      );
      image.setPixel(x, y, new PixelColor(saturated, color.alpha).clamp());
    }
  }

  return image;
};

/**
 * Adjusts the white balance of the image.
 * @param {!Image426} image
 * @param {!PixelColor} white - The white point color.
 * @returns {!Image426} The given image (now modified).
 */
Filters.whiteBalanceFilter = function (image, white) {
  // Apply the Von Kries method: convert the image from RGB to LMS, divide by
  // the LMS coordinates of the white point color, and convert back to RGB.
  // Note that `Image426.setPixel()` will accept a `PixelColor` in any
  // colorspace and automatically convert it to RGB.
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const lms = color.toLms();
      lms.divideEachBy(white.data);
      const output = lms.toRgb();
      image.setPixel(x, y, output);
    }
  }

  return image;
};

/**
 * Convolves the image with a Gaussian filter.
 * @param {!Image426} image
 * @param {number} sigma
 * @returns {!Image426} The result image.
 */
Filters.gaussianFilter = function (image, sigma) {
  // The filter window will be [-winR, winR] for a total diameter of:
  //   2 * winR + 1
  const winR = Math.max(1, Math.ceil(sigma * 3));

  let newImage = new Image426(image.width, image.height);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let firstInputPixel = image.getPixel(x, y);

      let outputPixel = new PixelColor([0, 0, 0], firstInputPixel.alpha);

      for (let a = x - winR; a <= x + winR; a++) {
        let secondInputPixel = image.getPixel(a, y);
        let filterWeight =
          Math.E ** ((-1 * Math.abs(x - a) ** 2) / (2 * sigma ** 2)) /
          Math.sqrt(2 * Math.PI * sigma ** 2);

        outputPixel.add(secondInputPixel.multiplyBy(filterWeight));
      }

      newImage.setPixel(x, y, outputPixel);
    }
  }

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let firstInputPixel = image.getPixel(x, y);

      let outputPixel = new PixelColor([0, 0, 0], firstInputPixel.alpha);

      for (let b = y - winR; b <= y + winR; b++) {
        let secondInputPixel = image.getPixel(x, b);
        let filterWeight =
          Math.E ** ((-1 * Math.abs(y - b) ** 2) / (2 * sigma ** 2)) /
          Math.sqrt(2 * Math.PI * sigma ** 2);

        outputPixel.add(secondInputPixel.multiplyBy(filterWeight));
      }

      newImage.setPixel(x, y, outputPixel);
    }
  }

  return newImage;
};

/**
 * Sharpens the image by convolving it with the edge detection kernel and adding
 * the result to the original image.
 * @param {!Image426} image
 * @returns {!Image426} The result image.
 */
Filters.sharpenFilter = function (image) {
  let newImg = new Image426(image.width, image.height);

  const kernel = [
    [-1, -1, -1],
    [-1, 9, -1],
    [-1, -1, -1],
  ];

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let pixels = [
        [
          image.getPixel(x - 1, y - 1),
          image.getPixel(x, y - 1),
          image.getPixel(x + 1, y - 1),
        ],
        [
          image.getPixel(x - 1, y),
          image.getPixel(x, y),
          image.getPixel(x + 1, y),
        ],
        [
          image.getPixel(x - 1, y + 1),
          image.getPixel(x, y + 1),
          image.getPixel(x + 1, y + 1),
        ],
      ];

      let output = convolve(pixels, kernel);

      newImg.setPixel(x, y, new PixelColor(output));
    }
  }

  return newImg;
};

/**
 * Blurs an image and removes speckle noise by replacing each pixel with the
 * median of its neighbors.
 * @param {!Image426} image
 * @param {number} winR - The window radius.
 * @returns {!Image426} The result image.
 */
Filters.medianFilter = function (image, winR) {
  // A pixel's neighborhood is a square window of side length `2 * winR + 1`
  // that is centered at the pixel (`winR` on each side).
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let pixels = [];
      let outputs = [];

      for (let j = y - winR; j <= y + winR; j++) {
        for (let i = x - winR; i <= x + winR; i++) {
          pixels.push(image.getPixel(i, j));
        }
      }

      for (let i = 0; i < 3; i++) {
        let values = pixels.map((value) => value.data[i]);

        outputs.push(mediate(values));
      }

      image.setPixel(x, y, new PixelColor(outputs, image.getPixel(x, y).alpha));
    }
  }

  return image;
};

/**
 * Blurs an image while preserving edges by replacing each pixel with a weighted
 * average of nearby pixels.
 * @param {!Image426} image
 * @param {number} sigmaR
 * @param {number} sigmaS
 * @returns {!Image426} The result image.
 */
Filters.bilateralFilter = function (image, sigmaR, sigmaS) {
  // Reference: https://en.wikipedia.org/wiki/Bilateral_filter
  // We first compute window size and preprocess sigmaR
  const winR = Math.max(1, Math.ceil(sigmaS));
  sigmaR *= Math.sqrt(2) * winR;

  let newImage = new Image426(image.width, image.height);

  for (let j = 0; j < image.height; j++) {
    for (let i = 0; i < image.width; i++) {
      let firstPixel = image.getPixel(i, j);
      let outputPixel = new PixelColor([0, 0, 0], firstPixel.alpha);

      let filterWeightSum = 0;

      for (let l = j - winR; l <= j + winR; l++) {
        for (let k = i - winR; k <= i + winR; k++) {
          let secondPixel = image.getPixel(k, l);

          let squaredDistance = (i - k) ** 2 + (j - l) ** 2;
          let pixelDifferences = firstPixel
            .createCopy()
            .toRgb()
            .subtract(secondPixel.createCopy().toRgb());
          let squaredPixelDifference =
            pixelDifferences.data[0] ** 2 +
            pixelDifferences.data[1] ** 2 +
            pixelDifferences.data[2] ** 2;

          let filterWeight =
            Math.E **
            ((-1 * squaredDistance) / (2 * sigmaS ** 2) -
              squaredPixelDifference / (2 * sigmaR ** 2));

          filterWeightSum += filterWeight;

          secondPixel.multiplyBy(filterWeight);
          outputPixel.add(secondPixel);
        }
      }

      newImage.setPixel(i, j, outputPixel.divideBy(filterWeightSum));
    }
  }

  return newImage;
};

/**
 * Converts an image to binary using simple rounding.
 * @param {!Image426} image
 * @returns {!Image426} The result image.
 */
Filters.quantizeFilter = function (image) {
  // convert to grayscale
  image = Filters.grayscaleFilter(image);

  // round all pixel colors
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const data = color.data.map((value) => Math.round(value));
      image.setPixel(x, y, new PixelColor(data, color.alpha).clamp());
    }
  }
  return image;
};

/**
 * Converts an image to binary using random dithering.
 * @param {!Image426} image
 * @returns {!Image426} The result image.
 */
Filters.randomFilter = function (image) {
  // convert to grayscale
  image = Filters.grayscaleFilter(image);

  // Apply random noise and quantize the image.
  for (let x = 0; x < image.width; x++) {
    for (let y = 0; y < image.width; y++) {
      const color = image.getPixel(x, y);
      const randomNoise = Math.random() - 0.5;
      const data = color.data.map((value) => Math.round(value + randomNoise));
      image.setPixel(x, y, new PixelColor(data, color.alpha).clamp());
    }
  }

  return image;
};

/**
 * Converts an image to binary using Floyd-Steinberg error diffusion.
 * @param {!Image426} image
 * @returns {!Image426} The result image.
 */
Filters.floydFilter = function (image) {
  // convert to grayscale
  image = Filters.grayscaleFilter(image);

  // Quantize each pixel and diffuse the quantization error to the neighboring
  // pixels.
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);

      const quantizedData = color
        .createCopy()
        .data.map((value) => Math.round(value));
      const quantizedColor = new PixelColor(quantizedData, color.alpha).clamp();

      const quantizationError = color.createCopy().subtract(quantizedColor);

      let newColors = [
        image
          .getPixel(x + 1, y)
          .add(quantizationError.createCopy().multiplyBy(7 / 16))
          .clamp(),
        image
          .getPixel(x - 1, y + 1)
          .add(quantizationError.createCopy().multiplyBy(3 / 16))
          .clamp(),
        image
          .getPixel(x, y + 1)
          .add(quantizationError.createCopy().multiplyBy(5 / 16))
          .clamp(),
        image
          .getPixel(x + 1, y + 1)
          .add(quantizationError.createCopy().multiplyBy(1 / 16))
          .clamp(),
      ];

      image.setPixel(x + 1, y, newColors[0].clamp());
      image.setPixel(x - 1, y + 1, newColors[1].clamp());
      image.setPixel(x, y + 1, newColors[2].clamp());
      image.setPixel(x + 1, y + 1, newColors[3].clamp());
    }
  }

  return image;
};

/**
 * Converts an image to binary using ordered dithering.
 * @param {*} image
 * @returns
 */
Filters.orderedFilter = function (image) {
  // convert to gray scale
  image = Filters.grayscaleFilter(image);

  let D = [
    [15, 7, 13, 5],
    [3, 11, 1, 9],
    [12, 4, 14, 6],
    [0, 8, 2, 10],
  ];

  let m = D[0].length;
  let n = D.length;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let inputPixel = image.getPixel(x, y);

      let i = x % m;
      let j = y % n;

      let quantizedPixel = new PixelColor(
        inputPixel.createCopy().data.map((value) => Math.floor(value)),
        inputPixel.alpha
      );
      let quantizationError = inputPixel.createCopy().subtract(quantizedPixel);

      let threshold = (D[i][j] + 1) / (m ** 2 + 1);

      if (quantizationError.data[0] > threshold) {
        image.setPixel(
          x,
          y,
          new PixelColor(
            inputPixel.data.map((value) => Math.ceil(value)),
            inputPixel.alpha
          )
        );
      } else {
        image.setPixel(x, y, quantizedPixel);
      }
    }
  }

  return image;
};

/**
 * Samples the pixel at the given position using either bilinear, Gaussian, or
 * basic point sampling.
 *
 * This is a utility function that doesn't appear on the GUI. Call this function
 * from filters that require sampling (e.g., scale, rotate, etc).
 * @param {!Image426} image
 * @param {number} x
 * @param {number} y
 * @param {"point"|"bilinear"|"gaussian"} mode - The sampling mode.
 * @returns {!PixelColor} The sampled pixel.
 */
Filters.samplePixel = function (image, x, y, mode) {
  // constrain x and y to within bounds of image
  x = clamp(x, 0, image.width - 1);
  y = clamp(y, 0, image.height - 1);

  if (mode === "bilinear") {
    let inputPixel = image.getPixel(x, y);

    let neighboringPixels = [
      image.getPixel(x - 1, y - 1),
      image.getPixel(x + 1, y - 1),
      image.getPixel(x - 1, y + 1),
      image.getPixel(x + 1, y + 1),
    ];

    let firstExpression = neighboringPixels[0]
      .createCopy()
      .add(neighboringPixels[1]);
    let secondExpression = neighboringPixels[2]
      .createCopy()
      .add(neighboringPixels[3]);

    let outputPixel = firstExpression
      .createCopy()
      .add(secondExpression)
      .multiplyBy(1 / 4);

    return outputPixel;
  } else if (mode === "gaussian") {
    let inputPixel = image.getPixel(x, y);
    let outputPixel = new PixelColor([0, 0, 0], inputPixel.alpha);

    let gaussianWeightSum = 0;

    for (let j = y - 3; j <= y + 3; j++) {
      for (let i = x - 3; i <= x + 3; i++) {
        let currentPixel = image.getPixel(i, j);

        let squaredDistance = (x - i) ** 2 + (y - j) ** 2;
        let gaussianWeight = Math.E ** ((-1 * squaredDistance) / 2);

        gaussianWeightSum += gaussianWeight;

        outputPixel.add(currentPixel.createCopy().multiplyBy(gaussianWeight));
      }
    }

    outputPixel.divideBy(gaussianWeightSum);

    return outputPixel;
  }
  // default to basic point sampling
  return image.getPixel(Math.round(x), Math.round(y));
};

/**
 * Scales an image in width and height by the given ratio.
 * @param {!Image426} image
 * @param {number} ratio
 * @param {"point"|"bilinear"|"gaussian"} sampleMode - The sampling mode.
 * @returns {!Image426} The result image.
 */
Filters.scaleFilter = function (image, ratio, sampleMode) {
  let transformedImage = new Image426(
    Math.round(image.width * ratio),
    Math.round(image.height * ratio)
  );

  for (let y = 0; y < transformedImage.height; y++) {
    for (let x = 0; x < transformedImage.width; x++) {
      let outputPixel = Filters.samplePixel(
        image,
        x / ratio,
        y / ratio,
        sampleMode
      );

      transformedImage.setPixel(x, y, outputPixel);
    }
  }

  return transformedImage;
};

/**
 * Morphs two images together using Beier92.
 * @param {!Image426} initialImg - The initial (before) image.
 * @param {number} alpha - The morph time.
 * @param {"point"|"bilinear"|"gaussian"} sampleMode - The sampling mode.
 * @param {number} radialCutoff - Measures the distance cutoff of the vector field for
 * a single vector scaled by its length
 * @param {number} angularCutoff Measures the cutoff of the vector field for a
 * single vector based on the angle made with that vector
 * @param {string} linesFile - A JSON file containing the corresponding flow vector
 * @returns {!Image426} The result image.
 */
Filters.flowFilter = function (initialImg, alpha, sampleMode, linesFile) {
  /**
   * The corresponding morph lines between the initial and final images. Each
   * object in the `lines.initial` and `lines.final` arrays represents a line
   * from (x0, y0) to (x1, y1). The first line of `lines.initial` maps to the
   * first line of `lines.final`, and so on (i.e., the arrays have the same
   * length).
   * @type {
   *     {vectors: !Array<{x0: number, y0: number, x1: number, y1: number}>}
   * }
   */
  console.log(linesFile);
  const vectors = Parser.parseJsonFile(linesFile);

  const w = image.width,
    h = image.height;
  const cx = (w - 1) / 2,
    cy = (h - 1) / 2; // middle of image
  const rMax = Math.hypot(cx, cy); // diagonal
  const out = new Image426(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx,
        dy = y - cy;
      const r = Math.hypot(dx, dy);
      const t = rMax > 0 ? Math.min(Math.max(r / rMax, 0), 1) : 0;
      const ang = t * radians; // linear increase
      const cosA = Math.cos(ang),
        sinA = Math.sin(ang);

      // inverse map
      const sx = cx + dx * cosA + dy * -sinA;
      const sy = cy + dx * sinA + dy * cosA;

      out.setPixel(x, y, Filters.samplePixel(image, sx, sy, sampleMode));
    }
  }

  // copy back
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++) image.setPixel(xx, yy, out.getPixel(xx, yy));
  return image;
};

/**
 * Morphs two images together using Beier92.
 * @param {!Image426} initialImg - The initial (before) image.
 * @param {number} alpha - The morph time.
 * @param {"point"|"bilinear"|"gaussian"} sampleMode - The sampling mode.
 * @param {number} radialCutoff - Measures the distance cutoff of the vector field for
 * a single vector scaled by its length
 * @param {number} angularCutoff Measures the cutoff of the vector field for a
 * single vector based on the angle made with that vector
 * @param {string} linesFile - A JSON file containing the corresponding flow vector
 * @returns {!Image426} The result image.
 */
Filters.flowFilter = function (initialImg, alpha, sampleMode, linesFile) {
  /**
   * The corresponding morph lines between the initial and final images. Each
   * object in the `lines.initial` and `lines.final` arrays represents a line
   * from (x0, y0) to (x1, y1). The first line of `lines.initial` maps to the
   * first line of `lines.final`, and so on (i.e., the arrays have the same
   * length).
   * @type {
   *     {vectors: !Array<{x0: number, y0: number, x1: number, y1: number}>}
   * }
   */
  console.log(linesFile);
  const vectors = Parser.parseJsonFile(linesFile);

  const finalImg = initialImg.createCopy();

  const radialCutoff = 0.7;
  const angularCutoff = Math.PI / 2.5;

  const fadeTime = 0.7;
  const fadeMax = 0.7;

  alpha = 0.7 * alpha + 0.3;

  const fadeAlpha = Math.max(
    0,
    fadeMax * ((alpha - fadeTime) / (1 - fadeTime))
  );

  const blendColors = function (colorA, colorB) {
    const a = blend(colorA.data[0], colorB.data[0], fadeAlpha);
    const b = blend(colorA.data[1], colorB.data[1], fadeAlpha);
    const c = blend(colorA.data[2], colorB.data[2], fadeAlpha);

    return new PixelColor([a, b, c]);
  };

  const dist = function (vector, x, y) {
    let dx = x - vector.x0;
    let dy = y - vector.y0;
    return Math.hypot(dx, dy);
  };

  const angl = function (vector, x, y) {
    let dxV = vector.x1 - vector.x0;
    let dx = x - vector.x0;

    let dyV = vector.y1 - vector.y0;
    let dy = y - vector.y0;

    let dot = dxV * dx + dyV * dy;

    return Math.acos(dot / (Math.hypot(dxV, dyV) * Math.hypot(dx, dy)));
  };

  const displacement = function (vector, x, y) {
    const vecLen = Math.hypot(vector.x1 - vector.x0, vector.y1 - vector.y0);
    const r = Math.max(0, 1 - dist(vector, x, y) / (radialCutoff * vecLen));
    const theta = Math.max(0, 1 - (1 / angularCutoff) * angl(vector, x, y));

    const a = r * theta * alpha;
    const dx = vector.x1 - vector.x0;
    const dy = vector.y1 - vector.y0;

    const v = { dx: dx * a, dy: dy * a };
    return v;
  };

  for (const vector of vectors.vectors) {
    for (let y = 0; y < finalImg.height; y++) {
      for (let x = 0; x < finalImg.width; x++) {
        let disp = displacement(vector, x, y);
        const dispStr = Math.hypot(disp.dx, disp.dy);
        const xF = x + disp.dx;
        const yF = y + disp.dy;

        if (finalImg.validCoords(xF, yF) && dispStr > 20) {
          const colorA = initialImg.getPixel(x, y);
          const colorB = initialImg.getPixel(xF, yF);
          finalImg.setPixel(xF, yF, blendColors(colorA, colorB));
        }
      }
    }
  }

  initialImg.setImageData(finalImg.getImageData().data);

  return initialImg;
};

/**
 * Adds the given palette colors to the image on the right.
 * @param {!Image426} image
 * @param {!Array<!PixelColor>} palette - The color palette.
 * @returns {!Image426} The resulting image with the palette.
 */
const addPaletteToImage = function (image, palette) {
  if (palette.length === 0) return image;
  const WIDTH = 80;

  // sort the colors (arbitrary deterministic sorting function)
  palette = [...palette].sort((a, b) => b.luminance() - a.luminance());

  const colorHeight = Math.floor(image.height / palette.length);
  const heights = new Array(palette.length).fill(colorHeight);
  const leftover = image.height % palette.length;
  for (let i = 0; i < leftover; i++) {
    heights[i] += 1;
  }

  const newImg = Image426.createWhite(image.width + WIDTH, image.height);
  // copy original image
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      newImg.setPixel(x, y, image.getPixel(x, y));
    }
  }
  // add palette colors
  let i = 0;
  for (let y = 0; y < image.height; y++) {
    if (heights[i] === 0) i++;
    heights[i]--;
    const color = palette[i];
    for (let x = 0; x < WIDTH; x++) {
      newImg.setPixel(image.width + x, y, color);
    }
  }
  return newImg;
};

/**
 * Continuously changes the contrast of pixels which are of a particular hue (in an image).
 *
 * Interpolates between a constant gray image (ratio = -1) with the average
 * luminance and the original image (ratio = 0).
 * @param {!Image426} image
 * @param {!Image426} hue The hue of the pixels to be contrasted (red, orange, or yellow).
 * @param {number} brightness - A value in the range [-0.5, 0.5].
 * @returns {!Image426} The given image (now modified).
 */
Filters.sparkleFilter = function (image, hue, brightness) {
  let newImage = new Image426(image.width, image.height);
  const K = 1.0; // Maximum pixel value

  // Use global animation time if available (continuously increasing), otherwise use 0
  let time =
    typeof Main !== "undefined" && Main.animationTime != null
      ? Main.animationTime
      : 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const hsl = color.toHsl();
      let range;
      switch (hue) {
        case "red":
          range = [0 / 360, 20 / 360];
          break;
        case "orange":
          range = [20 / 360, 40 / 360];
          break;
        default:
          range = [50 / 360, 80 / 360];
          break;
      }
      if (hsl.data[0] >= range[0] && hsl.data[0] <= range[1]) {
        const contrasted = color.data.map((value) =>
          contrast(value, K, brightness * Math.sin(time))
        );
        newImage.setPixel(
          x,
          y,
          new PixelColor(contrasted, color.alpha).clamp()
        );
      } else {
        newImage.setPixel(x, y, color);
      }
    }
  }

  return newImage;
};

/**
 * Makes clouds appear to "breathe" with vertical displacement
 * and brightness pulse.
 * Only affects cloud-like pixels in the upper sky region.
 * @param {!Image426} image
 * @param {number} intensity Intensity of the breathing effect (0-1).
 * @returns {!Image426} The result image.
 */
Filters.breatheFilter = function (image, intensity) {
  const newImage = new Image426(image.width, image.height);

  // Get animation time if available
  const time =
    typeof Main !== "undefined" && Main.animationTime != null
      ? Main.animationTime
      : 0;

  // Cloud detection parameters
  const skyRegionTop = 0.0;
  const skyRegionBottom = 0.6; // Upper 60%
  const maxSaturation = 0.3; // Low saturation
  const minLightness = 0.7; // High lightness

  // Breathing parameters
  const maxVerticalDisplacement = intensity * 20; // Max displacement
  const brightnessPulseAmount = intensity * 0.25; // Brightness variation

  // Calculate sky region
  const skyStartY = Math.floor(image.height * skyRegionTop);
  const skyEndY = Math.floor(image.height * skyRegionBottom);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const originalColor = image.getPixel(x, y);

      // Check if in sky
      const isInSkyRegion = y >= skyStartY && y <= skyEndY;

      if (isInSkyRegion) {
        // Convert to HSL
        const hsl = originalColor.toHsl();
        const saturation = hsl.data[1];
        const lightness = hsl.data[2];

        // Check if pixel is cloud-like
        const isCloud = saturation < maxSaturation && lightness > minLightness;

        if (isCloud) {
          // Calculate distance from top
          const normalizedY = (y - skyStartY) / (skyEndY - skyStartY);

          // Displacement stronger at top
          const topStrength = 1.0 - normalizedY; // 1.0 at top, 0.0 at horizon

          // Breathing motion
          // const breathingPhase = Math.sin(time * 0.7) * 0.5 + 0.5; // 0 to 1

          // Vertical displacement
          const verticalDisplacement =
            time * 0.7 * maxVerticalDisplacement * topStrength;

          // Vertical displacement
          const sourceY = y + verticalDisplacement;
          const sourceColor = Filters.samplePixel(
            image,
            x,
            sourceY,
            "bilinear"
          );

          // Apply brightnesss
          const brightnessMultiplier =
            1.0 + time * 0.7 * brightnessPulseAmount * topStrength;

          const finalColor = new PixelColor(
            [
              Math.min(1.0, sourceColor.data[0] * brightnessMultiplier),
              Math.min(1.0, sourceColor.data[1] * brightnessMultiplier),
              Math.min(1.0, sourceColor.data[2] * brightnessMultiplier),
            ],
            sourceColor.alpha
          ).clamp();

          newImage.setPixel(x, y, finalColor);
        } else {
          // Not a cloud
          newImage.setPixel(x, y, originalColor);
        }
      } else {
        // Not in sky
        newImage.setPixel(x, y, originalColor);
      }
    }
  }

  return newImage;
};

/**
 * Make water-like pixels in the bottom half of an image appear to ripple.
 * @param {!Image426} image
 * @param {number} amplitude Amplitude of the water (0-10).
 * @param {number} frequency Ripples per pixel distance (0-1).
 * @param {number} speed How fast ripples move outward (1-5).
 * @returns {!Image426} The result image.
 */
Filters.rippleFilter = function (image, amplitude, frequency, speed) {
  const width = image.width;
  const height = image.height;
  const newImage = new Image426(width, height);

  const centerX = width / 2;
  const centerY = height / 2.5;

  // Global animation time
  const time =
    typeof Main !== "undefined" && Main.animationTime != null
      ? Main.animationTime
      : 0;

  // Water
  const waterRegionTop = Math.floor((2 * height) / 3); // Only bottom ~55%
  const minSaturation = 0.2;
  const minLightness = 0.15;
  const maxLightness = 0.85;
  const minHue = 0.5; // Cyan-ish
  const maxHue = 0.75; // Blue-ish

  // True blue
  const waterMask = [];
  for (let y = 0; y < height; y++) {
    waterMask[y] = new Array(width).fill(false);
  }

  for (let y = waterRegionTop; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const hsl = image.getPixel(x, y).toHsl();
      const hue = hsl.data[0];
      const sat = hsl.data[1];
      const light = hsl.data[2];

      const isWater =
        hue >= minHue &&
        hue <= maxHue &&
        sat >= minSaturation &&
        light >= minLightness &&
        light <= maxLightness;

      if (isWater) {
        waterMask[y][x] = true;
      }
    }
  }

  // Horizontally contiguous expansion
  const rippleMask = [];
  for (let y = 0; y < height; y++) {
    rippleMask[y] = new Array(width).fill(false);
  }

  for (let y = waterRegionTop; y < height; y++) {
    let left = -1;
    let right = -1;

    // Find first and last water pixels in this row
    for (let x = 0; x < width; x++) {
      if (waterMask[y][x]) {
        if (left === -1) left = x;
        right = x;
      }
    }

    // If we found at least one water pixel
    if (left !== -1) {
      for (let x = left; x <= right; x++) {
        rippleMask[y][x] = true;
      }
    }
  }

  // Apply ripple where ripple mask is true
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const originalColor = image.getPixel(x, y);

      if (rippleMask[y][x]) {
        // Same ripple computation
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const ripple =
          Math.sin(distance * frequency - time * speed) * amplitude;

        const angle = Math.atan2(dy, dx);
        const sourceX = x + Math.cos(angle) * ripple;
        const sourceY = y + Math.sin(angle) * ripple;

        const color = Filters.samplePixel(image, sourceX, sourceY, "point");
        newImage.setPixel(x, y, color);
      } else {
        // Non-water
        newImage.setPixel(x, y, originalColor);
      }
    }
  }

  return newImage;
};

/**
 * Translates pixels that are of green hue sinusoidally and diagonally across
 * the image, making objects like leaves and trees appear as though they are
 * blowing in the wind.
 * @param {!Image426} image
 * @param {number} speed The speed of the wind (1-5).
 * @param {number} direction The direction of the wind (left or right).
 * @returns {!Image426} The result image.
 */
Filters.windFilter = function (image, speed, direction) {
  let newImg = new Image426(image.width, image.height);

  // Use global animation time if available (continuously increasing), otherwise use 0
  let time =
    typeof Main !== "undefined" && Main.animationTime != null
      ? Main.animationTime
      : 0;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const color = image.getPixel(x, y);
      const hsl = color.toHsl();

      if (hsl.data[0] >= 0.22 && hsl.data[0] <= 0.39) {
        let output;
        if (direction === "left") {
          output = image.getPixel(
            x + Math.round(speed * Math.sin(time)),
            y + Math.round(speed * Math.sin(time))
          );
        } else {
          output = image.getPixel(
            x - Math.round(speed * Math.sin(time)),
            y - Math.round(speed * Math.sin(time))
          );
        }

        newImg.setPixel(x, y, output);
      } else {
        newImg.setPixel(x, y, color);
      }
    }
  }

  return newImg;
};
