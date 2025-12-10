"use strict";

assert(Main, "`imageMain.js` requires `main.js`");

Object.assign(Main, {
  // default dimensions for the canvas
  canvasDefaultWidth: 600,
  canvasDefaultHeight: 400,

  // how much to offset display of each image on stack
  imageStackDisplayOffset: 100,

  /**
   * The preloaded images as a mapping from filenames to images.
   * @type {!Object<string, !Image426>}
   */
  images: {},
});

/** Clears the display. */
Main.clearDisplay = function () {
  Main.ctx.clearRect(0, 0, Main.canvas.width, Main.canvas.height);
};

/** Displays the given image. */
Main.displayImage = function (image, offsetX, offsetY, noClear) {
  offsetX = offsetX ?? 0;
  offsetY = offsetY ?? 0;
  if (!noClear) {
    // NOTE: changing canvas dimensions clears it
    Main.canvas.width = image.width + offsetX;
    Main.canvas.height = image.height + offsetY;
  }
  Main.ctx.putImageData(image.getImageData(), offsetX, offsetY);
};

/** Override function: displays the image stack. */
Main.refreshDisplay = function () {
  if (Main.baseStack.length === 0) {
    // clear the display
    Main.clearDisplay();
    // reset the dimensions
    Main.canvas.width = Main.canvasDefaultWidth;
    Main.canvas.height = Main.canvasDefaultHeight;
    return;
  }

  const imagesAndOffsets = Main.baseStack.map((image, i) => [
    image,
    i * Main.imageStackDisplayOffset,
  ]);

  // set the proper size of the canvas
  let width = 0;
  let height = 0;
  for (const [image, displayOffset] of imagesAndOffsets) {
    // never shrink the canvas; messes with gif creation when using image stack
    width = Math.max(width, displayOffset + image.width);
    height = Math.max(height, displayOffset + image.height);
  }
  Main.canvas.width = width;
  Main.canvas.height = height;

  // display all the images
  Main.clearDisplay();
  for (const [image, displayOffset] of imagesAndOffsets) {
    Main.displayImage(image, displayOffset, displayOffset, true);
  }
};

/** Pushes a new brush splat center for "Brush" filters. */
Main.pushBrushSplat = function () {
  const historyFilters = Gui.historyFilters;
  if (historyFilters.length === 0) return;
  const topFilterInst = historyFilters[historyFilters.length - 1];
  const filterName = topFilterInst.filterDef.name;
  if (!filterName.includes("Brush")) return;

  const displayOffset =
    Math.max(Main.baseStack.length - 1, 0) * Main.imageStackDisplayOffset;
  const x = Main.mouseX - displayOffset;
  const y = Main.mouseY - displayOffset;

  const coordsTextBox = topFilterInst.filterDef.getParamValue(
    topFilterInst.guiControls,
    "coords"
  );
  coordsTextBox.setValue(coordsTextBox.getValue() + `x${x}y${y}`);
};

Main.init = function () {
  const $canvas = $("#canvas");
  Main.canvas = $canvas.get(0);
  Main.canvas.width = Main.canvasDefaultWidth;
  Main.canvas.height = Main.canvasDefaultHeight;
  Main.ctx = Main.canvas.getContext("2d");

  Main.gifEncoder = new GIFEncoder();
  Main.gifEncoder.setRepeat(0);
  Main.gifEncoder.setDelay(0.05);
  Main.gifEncoder.start();

  $canvas.on("mousemove", (event) => {
    Main.mouseX = event.offsetX ?? event.layerX;
    Main.mouseY = event.offsetY ?? event.layerY;
    if (Main.mousePressed) {
      Main.pushBrushSplat();
    }
  });
  $canvas.on("mousedown", (event) => {
    Main.mousePressed = true;
    Main.pushBrushSplat();
  });
  $(window).on("mouseup", (event) => {
    Main.mousePressed = false;
  });

  // preload all images in list
  Main.imagesToLoad = GuiConfig.imageNames.length;
  for (const imageName of GuiConfig.imageNames) {
    const $image = $("<img>", { src: `images/${imageName}` });
    $image.on("load", () => {
      // width and height only work with the native element
      const img = $image.get(0);
      const width = img.width;
      const height = img.height;

      Main.clearDisplay();
      Main.canvas.width = width;
      Main.canvas.height = height;

      Main.ctx.drawImage(img, 0, 0);
      const imageData = Main.ctx.getImageData(0, 0, width, height);
      Main.clearDisplay();

      Main.images[imageName] = new Image426(
        width,
        height,
        imageData.data,
        imageName
      );
      Main.imagesToLoad--;

      if (Main.imagesToLoad <= 0) {
        Main.allImagesLoaded = true;
        Main.handleControlsChanged();
      }
    });
  }

  // initialize the gui
  Gui.init();
};
