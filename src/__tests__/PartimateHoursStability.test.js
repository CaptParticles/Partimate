const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const readEngine = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function loadEngine() {
    const linear = (t) => t;
    const easingFamily = () => ({ In: linear, Out: linear, InOut: linear });
    const sandbox = {
        Wick: {
            Base: class Base {
                constructor() { this._children = []; }
                addChild(child) { this._children.push(child); }
                getChildren() { return this._children || []; }
            },
            Frame: class Frame {
                constructor(args) { Object.assign(this, args); }
            },
        },
        TWEEN: {
            Easing: {
                Linear: { None: linear },
                Quadratic: easingFamily(),
                Cubic: easingFamily(),
                Quartic: easingFamily(),
                Quintic: easingFamily(),
                Sinusoidal: easingFamily(),
                Exponential: easingFamily(),
                Circular: easingFamily(),
                Back: easingFamily(),
                Bounce: easingFamily(),
            },
        },
        lerp: (a, b, t) => a + (b - a) * t,
        console: { warn: () => {}, error: () => {}, log: () => {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(readEngine('engine/src/Transformation.js'), sandbox, { filename: 'Transformation.js' });
    vm.runInContext(readEngine('engine/src/base/Tween.js'), sandbox, { filename: 'Tween.js' });
    vm.runInContext(readEngine('engine/src/base/Layer.js'), sandbox, { filename: 'Layer.js' });
    return sandbox.Wick;
}

const plain = (value) => JSON.parse(JSON.stringify(value));

describe('Partimate long-session stability regression checks', () => {
    test('transform defaults and independent copy remain stable', () => {
        const Wick = loadEngine();
        const original = new Wick.Transformation({ x: 12, y: -8, scaleX: 1.5, scaleY: 0.75, rotation: 37, opacity: 0.8 });
        const copy = original.copy();
        const defaults = new Wick.Transformation();
        expect(defaults.x).toBe(0);
        expect(defaults.y).toBe(0);
        expect(defaults.scaleX).toBe(1);
        expect(defaults.scaleY).toBe(1);
        expect(defaults.rotation).toBe(0);
        expect(defaults.opacity).toBe(1);
        expect(plain(copy.values)).toEqual(plain(original.values));
        copy.x = 900;
        expect(original.x).toBe(12);
    });

    test('linear tween interpolation produces expected midpoint and endpoint values', () => {
        const Wick = loadEngine();
        const start = new Wick.Tween({ playheadPosition: 1, easingType: 'none', transformation: new Wick.Transformation({ x: 10, y: 20, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 }) });
        const end = new Wick.Tween({ playheadPosition: 5, easingType: 'none', transformation: new Wick.Transformation({ x: 50, y: 60, scaleX: 3, scaleY: 5, rotation: 90, opacity: 0 }) });
        const mid = Wick.Tween.interpolate(start, end, 3).transformation;
        expect(mid.x).toBe(30);
        expect(mid.y).toBe(40);
        expect(mid.scaleX).toBe(2);
        expect(mid.scaleY).toBe(3);
        expect(mid.rotation).toBe(45);
        expect(mid.opacity).toBe(0.5);
        expect(Wick.Tween.interpolate(start, end, 1).transformation.x).toBe(10);
        expect(Wick.Tween.interpolate(start, end, 5).transformation.x).toBe(50);
    });

    test('interval-based findGaps finds only internal gaps even when frames are unsorted', () => {
        const Wick = loadEngine();
        const layer = Object.create(Wick.Layer.prototype);
        Object.defineProperty(layer, 'frames', { get: () => [
            { start: 13, end: 15 }, { start: 1, end: 3 }, { start: 7, end: 9 },
        ] });
        expect(plain(layer.findGaps())).toEqual([{ start: 4, end: 6 }, { start: 10, end: 12 }]);
    });

    test('gap filling inserts frames directly without recursive addFrame calls', () => {
        const Wick = loadEngine();
        const layer = Object.create(Wick.Layer.prototype);
        layer._frames = [{ start: 1, end: 2 }, { start: 5, end: 6 }];
        Object.defineProperty(layer, 'frames', { get: function () { return this._frames; } });
        layer.parentTimeline = { waitToFillFrameGaps: false, fillGapsMethod: 'blank_frames' };
        layer.addChild = function (child) { this._frames.push(child); };
        layer.addFrame = function () { throw new Error('resolveGaps unexpectedly called recursive addFrame'); };
        layer.resolveGaps();
        expect(plain(layer.frames.map((frame) => ({ start: frame.start, end: frame.end }))).sort((a, b) => a.start - b.start)).toEqual([
            { start: 1, end: 2 }, { start: 3, end: 4 }, { start: 5, end: 6 },
        ]);
    });

    test('playback restart disposes the previous timer before enabling the next session', () => {
        const projectSource = readEngine('engine/src/base/Project.js');
        const playStart = projectSource.indexOf('    play(args) {');
        const playEnd = projectSource.indexOf('    /**', playStart);
        expect(playStart).toBeGreaterThanOrEqual(0);
        expect(playEnd).toBeGreaterThan(playStart);
        const playBlock = projectSource.slice(playStart, playEnd);
        expect(playBlock.indexOf('if (this._tickIntervalID)')).toBeGreaterThanOrEqual(0);
        expect(playBlock.indexOf('if (this._tickIntervalID)')).toBeLessThan(playBlock.indexOf('this._playing = true;'));
    });

    test('editor and GUI teardown contain matching cleanup for long-lived global handlers', () => {
        const editorSource = readEngine('src/Editor/Editor.jsx');
        const guiSource = readEngine('engine/src/gui/Project.js');
        expect(editorSource).toContain("removeEventListener('touchstart', this._updateLastTouchTimeHandler, true)");
        expect(editorSource).toContain('this.project.stop();');
        expect(editorSource).toContain('this.project.guiElement.removeAllEventListeners();');
        expect(guiSource).toContain("$(this._canvas).off('mousewheel', this._mouseWheelHandler);");
        expect(guiSource).toContain('clearInterval(this.autoscrollInterval);');
    });
});