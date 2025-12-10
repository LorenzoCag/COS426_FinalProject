"use strict";

/**
 * A page to edit or create morph lines between two images.
 * @namespace
 */
var MorphLines = MorphLines || {};

Object.assign(MorphLines, {
  /** Maps canvas id to its <img> element. */
  imageSet: { initial: null, freeze: null },

  /**
   * Maps canvas id to points that define the morph lines, where each pair is a
   * single line.
   * @type {{"initial"|"final": !Array<{x: number, y: number}>}}
   */
  pointSet: { initial: [], final: [] },

  /**
   * Maps canvas id to the color of the balls at the ends of the morph lines.
   * @type {{"initial"|"final": string}}
   */
  ballColors: { initial: "blue", final: "blue" },
  /** The radius in pixels of the balls at the ends of the morph lines. */
  ballRadius: 6,

  /**
   * Array of JSON strings representing all the previous `pointSet` objects.
   * @type {!Array<string>}
   */
  undo: [],
});

MorphLines.reDrawSingleFigure = function (canvasId) {
  const ballColor = MorphLines.ballColors[canvasId];

  const canvas = $(`#${canvasId}`).get(0);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(MorphLines.imageSet[canvasId], 0, 0);

  function drawCircle(x, y, isSolid) {
    context.beginPath();
    context.arc(x, y, MorphLines.ballRadius, 0, Math.PI * 2, true);
    if (isSolid) {
      context.fillStyle = ballColor;
      context.fill();
    } else {
      context.strokeStyle = ballColor;
      context.stroke();
    }
  }

  let startLine = true;
  let lineNum = 1;
  let prevX = null;
  let prevY = null;
  for (const { x, y } of MorphLines.pointSet[canvasId]) {
    if (startLine) {
      // solid ball
      drawCircle(x, y, true);

      context.fillStyle = "white";
      context.fillText(lineNum, x - 3, y + 3);
    } else {
      // line
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(prevX, prevY);
      context.lineWidth = 2;
      context.strokeStyle = ballColor;
      context.stroke();

      context.fillStyle = "white";
      context.fillText(lineNum, prevX - 3, prevY + 3);

      // hollow ball
      drawCircle(x, y, false);

      // after ending the line, increment the line number
      lineNum++;
    }

    startLine = !startLine;
    prevX = x;
    prevY = y;
  }
};

MorphLines.reDrawFigures = function () {
  for (const canvasId of ["initial", "final"]) {
    if (MorphLines.imageSet[canvasId] == null) continue;
    MorphLines.reDrawSingleFigure(canvasId);
  }
};

MorphLines.pushPointSets = function () {
  MorphLines.undo.push(JSON.stringify(MorphLines.pointSet));
};

MorphLines.popPointSets = function () {
  if (MorphLines.undo.length < 2) {
    alert("No more undo steps available");
    return;
  }
  // pop the current state
  MorphLines.undo.pop();
  const pointSetJson = MorphLines.undo[MorphLines.undo.length - 1];
  MorphLines.pointSet = JSON.parse(pointSetJson);
  MorphLines.reDrawFigures();
  MorphLines.updatePointsJson();
};

MorphLines.updatePointsJson = function () {
  // don't use dot notation to make clear these are canvas names
  const initialPoints = MorphLines.pointSet["initial"];
  const finalPoints = MorphLines.pointSet["final"];

  const len = Math.floor(
    Math.min(initialPoints.length, finalPoints.length) / 2
  );
  if (len === 0) return;

  const initial = [];
  const final = [];
  for (let i = 0; i < len; i++) {
    const i1 = i * 2;
    const i2 = i1 + 1;
    initial.push({
      x0: initialPoints[i1].x,
      y0: initialPoints[i1].y,
      x1: initialPoints[i2].x,
      y1: initialPoints[i2].y,
    });
    final.push({
      x0: finalPoints[i1].x,
      y0: finalPoints[i1].y,
      x1: finalPoints[i2].x,
      y1: finalPoints[i2].y,
    });
  }

  const pointsJson = JSON.stringify({ initial, final });
  const data = "text/json;charset=utf-8," + encodeURIComponent(pointsJson);
  $("#download-link").attr("href", `data:${data}`);
};

MorphLines.loadImage = function (canvasId, imageName) {
  const $image = $("<img>", { src: `images/${imageName}` });
  $image.on("load", () => {
    const img = $image.get(0);

    MorphLines.imageSet[canvasId] = img;

    const $canvas = $(`#${canvasId}`);
    const canvas = $canvas.get(0);
    canvas.height = img.height;
    canvas.width = img.width;
    const context = canvas.getContext("2d");
    context.drawImage(img, 0, 0);

    const ballRadius2 = MorphLines.ballRadius * MorphLines.ballRadius;
    let currPointIndex = -1;

    function calcPoint(event) {
      const offset = canvas.getBoundingClientRect();
      const x =
        event.clientX +
        document.body.scrollLeft +
        document.documentElement.scrollLeft -
        Math.floor(offset.left) -
        1;
      const y =
        event.clientY +
        document.body.scrollTop +
        document.documentElement.scrollTop -
        Math.floor(offset.top);
      return { x, y };
    }

    $canvas.on("mousedown", (event) => {
      const point = calcPoint(event);

      const canvasPoints = MorphLines.pointSet[canvasId];
      const closePointIndex = canvasPoints.findIndex(({ x, y }) => {
        const dx = point.x - x;
        const dy = point.y - y;
        return dx * dx + dy * dy < ballRadius2;
      });
      if (closePointIndex !== -1) {
        // pointing to existing point
        currPointIndex = closePointIndex;
      }
      if (currPointIndex === -1) {
        // create new point
        canvasPoints.push(point);
        currPointIndex = canvasPoints.length - 1;
      }

      MorphLines.reDrawFigures();
      MorphLines.updatePointsJson();
    });
    $canvas.on("mousemove", (event) => {
      if (currPointIndex === -1) return;

      MorphLines.pointSet[canvasId][currPointIndex] = calcPoint(event);

      MorphLines.reDrawFigures();
      MorphLines.updatePointsJson();
    });
    $(window).on("mouseup", (event) => {
      if (currPointIndex !== -1) {
        MorphLines.pushPointSets();
        currPointIndex = -1;
      }
    });

    MorphLines.reDrawFigures();
    MorphLines.updatePointsJson();
  });
};

$(() => {
  function showError(error) {
    $("#error").text(error).show();
  }

  function decodeFilename(name) {
    return decodeURI(name);
  }

  let initialFile = null;
  let finalFile = null;
  let markerFile = null;
  for (const cmd of Parser.parseUrlCommands()) {
    const filename = cmd.argsStr;
    if (filename.length === 0) continue;
    if (cmd.name === "initial") {
      initialFile = filename;
    } else if (cmd.name === "final") {
      finalFile = filename;
    } else if (cmd.name === "marker") {
      markerFile = filename;
    }
  }
  if (initialFile == null || finalFile == null) {
    let msg = "Error in URL";
    if (initialFile == null && finalFile == null) {
      msg = "Error: Missing 'initial' and 'final' in URL";
    } else if (initialFile == null) {
      msg = "Error: Missing 'initial' in URL";
    } else if (finalFile == null) {
      msg = "Error: Missing 'final' in URL";
    }
    showError(msg);
    return;
  }

  if (markerFile != null) {
    const filename = decodeFilename(markerFile);
    let marker = null;
    try {
      marker = Parser.parseJsonFile(filename);
    } catch (error) {
      // invalid marker file, somehow
      markerFile = null;
      console.error(error);
      showError(error);
    }
    if (marker != null) {
      for (const canvasId of ["initial", "final"]) {
        const points = marker[canvasId] ?? [];
        for (const { x0, y0, x1, y1 } of points) {
          MorphLines.pointSet[canvasId].push(
            { x: x0, y: y0 },
            { x: x1, y: y1 }
          );
        }
      }
    }
  }

  // edit the url to only have the valid args
  const args = { initial: initialFile, final: finalFile };
  if (markerFile != null) args.marker = markerFile;
  const argsStr = Object.entries(args)
    .map(([key, value]) => `${key}=${encodeURI(value)}`)
    .join("&");
  history.pushState(null, "", `morphLines.html?${argsStr}`);

  MorphLines.loadImage("initial", decodeFilename(initialFile));
  MorphLines.loadImage("final", decodeFilename(finalFile));

  MorphLines.pushPointSets();

  $("#undo").on("click", (event) => {
    MorphLines.popPointSets();
  });
});
