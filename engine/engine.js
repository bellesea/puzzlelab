import { bitmapTextToImageData } from "./bitmap.js";
import { dispatch } from "../dispatch.js";
import { textToTune } from '../textTuneConverters.js';
import { global_state } from "../global_state.js";
import { sizeGameCanvas } from "../dispatches/sizeGameCanvas.js";
import * as render from "./render.js";


let cur = null;

export function init(canvas) {
  // remove event listeners
  let newCanvas = canvas.cloneNode(true);
  canvas.parentNode.replaceChild(newCanvas, canvas);
  canvas = newCanvas;

  render.init(canvas);

  canvas.setAttribute("tabindex", "1");


  function gameloop() {
    render.render(drawTiles());

    animationId = window.requestAnimationFrame(gameloop);
  }

  function end() {
    window.cancelAnimationFrame(animationId);
  }

  if (cur) cur();
  cur = end;


   let animationId = window.requestAnimationFrame(gameloop);

  function setScreenSize(w, h) {
    canvas.width = w;
    canvas.height = h;

    window.idealDimensions = [dimensions.width, dimensions.height];
    sizeGameCanvas();

    render.resize(canvas);
  }

  // tile gamelab
  let legend = [];
  let dimensions = {
    width: 0,
    height: 0,
    maxTileDim: 0,
  }
  let sprites = [];
  let tileInputs = {
    up: [],
    down: [],
    left: [],
    right: [],
    i: [],
    j: [],
    k: [],
    l: [],
  };
  let afterInputs = [];
  let solids = [];
  let pushable = {};
  let maxTileDim = 0;

  let background = "";
  const tempCanvas = document.createElement("canvas");
  // tempCanvas.width = 16;
  // tempCanvas.height = 16;

  class Sprite {
    constructor(type, x, y) {
      this._type = type;
      this._x = x;
      this._y = y;
      this.dx = 0;
      this.dy = 0;
    }

    set type(k) {
      const legendDict = Object.fromEntries(legend);
      if (!(k in legendDict)) throw new Error(`"${k}" not in legend.`);

      this.remove();
      addSprite(this._x, this._y, k);
    }

    get type() {
      return this._type;
    }

    set x(newX) {
      const dx = newX - this.x;
      if (_canMoveToPush(this, dx, 0)) this.dx = dx;
      return this;
    }

    get x() {
      return this._x;
    }

    set y(newY) {
      const dy = newY - this.y;
      if (_canMoveToPush(this, 0, dy)) this.dy = dy;
      return this;
    }

    get y() {
      return this._y;
    }

    remove() {
      sprites = sprites.filter(s => s !== this);
      return this;
    }
  }


  const _canMoveToPush = (sprite, dx, dy) => {
    const { x, y, type } = sprite;
    const { width, height } = dimensions;
    const i = (x+dx)+(y+dy)*width;

    const inBounds = (x+dx < width && x+dx >= 0 && y+dy < height && y+dy >= 0);
    if (!inBounds) return false;

    const grid = getGrid();

    const notSolid = !solids.includes(type);
    const noMovement = dx === 0 && dy === 0;
    const movingToEmpty = i < grid.length && grid[i].length === 0;

    if (notSolid || noMovement || movingToEmpty) {
      sprite._x += dx;
      sprite._y += dy;
      return true;
    }

    let canMove = true;

    grid[i].forEach(sprite => {
      const isSolid = solids.includes(sprite.type);
      const isPushable = (type in pushable) && pushable[type].includes(sprite.type);

      if (isSolid && !isPushable)
        canMove = false;

      if (isSolid && isPushable) {
        canMove = canMove && _canMoveToPush(sprite, dx, dy);
      }
    })

    if (canMove) {
      sprite._x += dx;
      sprite._y += dy;
    }

    return canMove;
  }

  canvas.addEventListener("keydown", (e) => {
    const key = e.key;

    const VALID_INPUTS = ["w", "a", "s", "d", "i", "j", "k", "l"];

    if (!VALID_INPUTS.includes(key)) return;

    if (key === "w") tileInputs["up"].forEach(fn => fn());
    if (key === "a") tileInputs["left"].forEach(fn => fn());
    if (key === "s") tileInputs["down"].forEach(fn => fn());
    if (key === "d") tileInputs["right"].forEach(fn => fn());
    if (key === "i") tileInputs["i"].forEach(fn => fn());
    if (key === "j") tileInputs["j"].forEach(fn => fn());
    if (key === "k") tileInputs["k"].forEach(fn => fn());
    if (key === "l") tileInputs["l"].forEach(fn => fn());

    afterInputs.forEach(f => f());

    sprites.forEach(s => {
      s.dx = 0;
      s.dy = 0;
    })

    e.preventDefault();
  });

  const getGrid = () => {
    const { width, height } = dimensions;

    const grid = new Array(width*height).fill(0).map(x => []);
    sprites.forEach(s => {
      const i = s.x+s.y*width;
      grid[i].push(s);
    })

    return grid;
  }

  const _checkBounds = (x, y) => {
    const { width, height } = dimensions;

    if (x > width || x < 0 || y < 0 || y > height) throw new Error(`Sprite out of bounds.`);
  }

  const _checkLegend = type => {
    if (!(type in Object.fromEntries(legend))) throw new Error(`Unknown sprite type: ${type}`);
  }

  const addSprite = (x, y, type) => {
    if (type === ".") return;

    _checkBounds(x, y);
    _checkLegend(type);

    const s = new Sprite(type, x, y);
    sprites.push(s);
  }

  let cachedTileImages = {};

  function setLegend(...bitmaps) {
    legend = bitmaps;

    // check that legend keys are single characters

    cachedTileImages = {};
    render.setBitmaps(bitmaps);
    dispatch("SET_BITMAPS", { bitmaps });
  }

  
  function _getTileImage(type) {
    const legendDict = Object.fromEntries(legend);
    if (!(type in legendDict)) throw new Error(`Type not in legend: ${type}`);

    const val = legendDict[type];
    const isCombo = val.type !== undefined;

    if (isCombo) throw new Error(`Can not draw combination sprites.`);

    if (!(type in cachedTileImages)) {
      const c = document.createElement("canvas");
      c.width = val.imageData.width;
      c.height = val.imageData.height;

      const ctx = c.getContext("2d");

      ctx.webkitImageSmoothingEnabled = false;
      ctx.mozImageSmoothingEnabled = false;
      ctx.imageSmoothingEnabled = false;

      ctx.putImageData(
        val.imageData, 
        0,
        0,
      );

      cachedTileImages[type] = c;
    }

    
    return cachedTileImages[type];
  }

  const _allEqual = arr => arr.every(val => val === arr[0]);

  function setMap(string) { 
    const rows = string.trim().split("\n").map(x => x.trim());
    const rowLengths = rows.map(x => x.length);
    const isRect = _allEqual(rowLengths)
    if (!isRect) throw new Error("Level must be rect.");
    const w = rows[0].length;
    const h = rows.length;
    dimensions.width = w;
    dimensions.height = h;

    sprites = [];

    setScreenSize(w*16, h*16);

    for (let i = 0; i < w*h; i++) {
      const char = string.split("").filter(x => x.match(/\S/))[i];
      if (char === ".") continue;
      // the index will be the ascii char for the number of the index
      const type = char;

      const x = i%w; 
      const y = Math.floor(i/w);


      addSprite(x, y, type);
    }
  }

  function clearTile(x, y) {
    sprites = sprites.filter(s => s.x !== x || s.y !== y);
  }

  function getTile(x, y) { 
    return getGrid()[dimensions.width*y+x] || [];
  }

  function hasDuplicates(array) {
    return (new Set(array)).size !== array.length;
  }

  function tilesWith(...matchingTypes) {
    const tiles = [];
    const grid = getGrid();
    for (let x = 0; x < dimensions.width; x++) {
      for (let y = 0; y < dimensions.height; y++) {
        const tile = grid[dimensions.width*y+x] || [];
        const matchIndices = matchingTypes.map(type => {
          return tile.map(s => s.type).indexOf(type);
        })


        if (!hasDuplicates(matchIndices) && !matchIndices.includes(-1)) tiles.push(tile);
      }
    }

    return tiles;
  }

  function setSolids(arr) {
    solids = arr;
  }

  function setPushables(map) {
    pushable = map;
  }

  function onInput(type, fn) {
    if (!(type in tileInputs)) console.error("Unknown input type:", type)
    tileInputs[type].push(fn);
  }

  function drawTiles() {
    const grid = getGrid();
    const { width, height, maxTileDim } = dimensions;
    if (width == 0 || height == 0) return new ImageData(1, 1);
    const img = new ImageData(width, height);

    for (let i = 0; i < grid.length; i++) {
      const x = i%width; 
      const y = Math.floor(i/width); 
      const sprites = grid[i];

      if (!sprites[0]) continue;
      const t = sprites[0].type;
      const r = sprites[0].type.charCodeAt(0);
      img.data[(y*dimensions.width + x)*4 + 0] = legend.findIndex(f => f[0] == t);
      img.data[(y*dimensions.width + x)*4 + 1] = (r*3) % 128;
      img.data[(y*dimensions.width + x)*4 + 2] = 255 - r;
      img.data[(y*dimensions.width + x)*4 + 3] = 255;
    }

    return img;
  }

  function afterInput(fn) {
    afterInputs.push(fn);
  }

  // how to add timed things, like bird flying and ball kicks
  
  // Tagged tempalate literal factory go brrr
  function _makeTag(cb) {
    return (strings, ...interps) => {
      if (typeof strings === "string") {
        throw new Error("Tagged template literal must be used like name`text`, instead of name(`text`)");
      }
      const string = strings.reduce((p, c, i) => p + c + (interps[i] ?? ''), '');
      return cb(string);
    }
  }

  return {
    setScreenSize,
    setLegend, 
    setMap, 
    addSprite,
    getGrid,
    getTile,
    tilesWith,
    clearTile, 
    onInput, 
    setSolids, 
    setPushables, 
    afterInput, 
    map: _makeTag(text => text), // No-op for now, here for editor support
    tune: _makeTag(text => textToTune(text)),
    bitmap: _makeTag(text => ({text, imageData: bitmapTextToImageData(text, global_state.palette)})),
    getFirst: (type) => sprites.find(t => t.type === type), // **
    getAll: (type) => type ? sprites.filter(t => t.type === type) : sprites, // **
    width: () => dimensions.width,
    height: () => dimensions.height,
    setBackground: (type) => { 
      _checkLegend(type);
      background = type;
    }
  }
}
