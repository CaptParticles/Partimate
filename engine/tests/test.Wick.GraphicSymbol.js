/*
 * Tests for Graphic Symbols: clips whose internal timeline is driven by the parent timeline,
 * including subframe playback (several internal frames inside a single parent frame).
 */
describe('Wick.Clip Graphic Symbols', function () {
    // Builds a project with one clip of `internalFrames` frames, exposed for `exposure` parent frames.
    function makeProject(internalFrames, exposure, animationType) {
        let project = new Wick.Project();
        let clip = new Wick.Clip();
        let frames = [clip.timeline.activeFrame];
        for (let i = 2; i <= internalFrames; i++) {
            let frame = new Wick.Frame({start: i});
            clip.timeline.addFrame(frame);
            frames.push(frame);
        }
        project.activeFrame.end = exposure;
        project.activeFrame.addClip(clip);
        clip.animationType = animationType || 'loop';
        clip.isGraphic = true;
        return {project, clip, frames};
    }

    // Internal frame shown by a clip at a fractional parent time.
    function frameAt(clip, parentTime) {
        return clip.getGraphicPosition(parentTime).frame;
    }

    describe('Graphic setting', function () {
        it('should default to off and behave like a normal clip', function () {
            let clip = new Wick.Clip();
            expect(clip.isGraphic).to.equal(false);
            expect(clip.followsParentTimeline).to.equal(false);
        });

        it('should serialize and deserialize', function () {
            let {clip} = makeProject(2, 1);
            let restored = Wick.Base.fromData(clip.serialize());
            expect(restored.isGraphic).to.equal(true);
            expect(restored.animationType).to.equal('loop');

            clip.isGraphic = false;
            let restoredOff = Wick.Base.fromData(clip.serialize());
            expect(restoredOff.isGraphic).to.equal(false);
        });

        it('should keep the setting when copied through a project data round trip', function () {
            let {clip} = makeProject(2, 1);
            let copy = clip.clone();
            expect(copy.isGraphic).to.equal(true);
        });

        it('should default to off for old project data without isGraphic', function () {
            let clip = new Wick.Clip();
            let data = clip.serialize();
            delete data.isGraphic;
            let restored = Wick.Base.fromData(data);
            expect(restored.isGraphic).to.equal(false);
        });

        it('should be changeable through the selection', function () {
            let {project, clip} = makeProject(2, 1);
            clip.isGraphic = false;
            project.selection.select(clip);
            expect(project.selection.isGraphic).to.equal(false);
            project.selection.isGraphic = true;
            expect(clip.isGraphic).to.equal(true);
            expect(project.selection.isGraphic).to.equal(true);
        });
    });

    describe('Subframe position math', function () {
        it('should show both frames of a 2-frame graphic inside a 1-frame exposure', function () {
            let {clip} = makeProject(2, 1);
            expect(frameAt(clip, 1.0)).to.equal(1);
            expect(frameAt(clip, 1.25)).to.equal(1);
            expect(frameAt(clip, 1.49)).to.equal(1);
            expect(frameAt(clip, 1.5)).to.equal(2);
            expect(frameAt(clip, 1.75)).to.equal(2);
            expect(frameAt(clip, 1.99)).to.equal(2);
        });

        it('should distribute 3 and 4 frames evenly inside a 1-frame exposure', function () {
            let three = makeProject(3, 1).clip;
            expect([1.0, 1.2, 1.34, 1.5, 1.67, 1.9].map(t => frameAt(three, t))).to.deep.equal([1, 1, 2, 2, 3, 3]);

            let four = makeProject(4, 1).clip;
            expect([1.0, 1.24, 1.26, 1.49, 1.51, 1.74, 1.76, 1.99].map(t => frameAt(four, t))).to.deep.equal([1, 1, 2, 2, 3, 3, 4, 4]);
        });

        it('should spread the internal frames across a shorter exposure', function () {
            // 4 internal frames across a 2-frame exposure: 2 internal frames per parent frame.
            let {clip} = makeProject(4, 2);
            expect([1.0, 1.5, 2.0, 2.5].map(t => frameAt(clip, t))).to.deep.equal([1, 2, 3, 4]);
        });

        it('should play at normal speed (and loop) in a longer exposure', function () {
            let {clip} = makeProject(2, 6);
            expect([1, 2, 3, 4, 5, 6].map(t => frameAt(clip, t))).to.deep.equal([1, 2, 1, 2, 1, 2]);
        });

        it('should hold the last frame for play once', function () {
            let {clip} = makeProject(3, 8, 'playOnce');
            expect([1, 2, 3, 4, 5, 8].map(t => frameAt(clip, t))).to.deep.equal([1, 2, 3, 3, 3, 3]);
            expect(frameAt(clip, 3.99)).to.equal(3);
        });

        it('should hold the last frame for play once inside a one-frame exposure', function () {
            let {clip} = makeProject(2, 1, 'playOnce');
            expect(frameAt(clip, 1.1)).to.equal(1);
            expect(frameAt(clip, 1.6)).to.equal(2);
        });

        it('should keep the logical frame in whole-frame time identical to the old synced behavior', function () {
            let {clip} = makeProject(3, 7);
            let old = [1, 2, 3, 4, 5, 6, 7].map(t => ((t - 1) % 3) + 1);
            expect([1, 2, 3, 4, 5, 6, 7].map(t => frameAt(clip, t))).to.deep.equal(old);
        });
    });

    describe('Playhead sync and scrubbing', function () {
        it('should update immediately when the parent playhead moves', function () {
            let {project, clip} = makeProject(3, 6);
            project.activeTimeline.playheadPosition = 2;
            expect(clip.timeline.playheadPosition).to.equal(2);
            project.activeTimeline.playheadPosition = 3;
            expect(clip.timeline.playheadPosition).to.equal(3);
            project.activeTimeline.playheadPosition = 4;
            expect(clip.timeline.playheadPosition).to.equal(1);
            project.activeTimeline.playheadPosition = 1;
            expect(clip.timeline.playheadPosition).to.equal(1);
        });

        it('should hold the selected internal frame in single frame mode', function () {
            let {project, clip} = makeProject(3, 6, 'single');
            clip.singleFrameNumber = 2;
            [1, 2, 3, 4, 5].forEach(position => {
                project.activeTimeline.playheadPosition = position;
                expect(clip.timeline.playheadPosition).to.equal(2);
            });
            expect(frameAt(clip, 1.5)).to.not.equal(undefined);
        });

        it('should not follow the parent when Graphic is off', function () {
            let {project, clip} = makeProject(3, 6);
            clip.isGraphic = false;
            clip.timeline.playheadPosition = 3;
            project.activeTimeline.playheadPosition = 5;
            expect(clip.timeline.playheadPosition).to.equal(3);
        });
    });

    describe('Nested and multiple graphics', function () {
        it('should sync nested graphics through the parent graphic', function () {
            let project = new Wick.Project();

            let inner = new Wick.Clip();
            inner.timeline.addFrame(new Wick.Frame({start: 2}));
            let outer = new Wick.Clip();
            outer.timeline.activeFrame.end = 2;
            outer.timeline.activeFrame.addClip(inner);
            outer.timeline.addFrame(new Wick.Frame({start: 3}));

            project.activeFrame.end = 3;
            project.activeFrame.addClip(outer);
            outer.isGraphic = true;
            inner.isGraphic = true;

            // outer has 3 internal frames across 3 parent frames: normal speed.
            project.activeTimeline.playheadPosition = 2;
            expect(outer.timeline.playheadPosition).to.equal(2);
            expect(inner.timeline.playheadPosition).to.equal(2);

            project.activeTimeline.playheadPosition = 3;
            expect(outer.timeline.playheadPosition).to.equal(3);
        });

        it('should sample multiple graphics independently', function () {
            let project = new Wick.Project();
            project.activeFrame.end = 1;

            let a = new Wick.Clip();
            a.timeline.addFrame(new Wick.Frame({start: 2}));
            let b = new Wick.Clip();
            b.timeline.addFrame(new Wick.Frame({start: 2}));
            b.timeline.addFrame(new Wick.Frame({start: 3}));
            b.timeline.addFrame(new Wick.Frame({start: 4}));

            project.activeFrame.addClip(a);
            project.activeFrame.addClip(b);
            a.isGraphic = true;
            b.isGraphic = true;

            let seen = [];
            [0, 0.3, 0.6, 0.9].forEach(f => {
                project._withGraphicSubframe(f, () => {
                    seen.push([a.timeline.playheadPosition, b.timeline.playheadPosition]);
                });
            });
            expect(seen).to.deep.equal([[1, 1], [1, 2], [2, 3], [2, 4]]);
        });

        it('should sample a nested graphic with the outer graphic subframe', function () {
            let project = new Wick.Project();
            project.activeFrame.end = 1;

            // outer: 2 frames, exposed 1 parent frame. Inner: 2 frames, exposed 1 outer frame.
            let outer = new Wick.Clip();
            let inner = new Wick.Clip();
            inner.timeline.addFrame(new Wick.Frame({start: 2}));
            outer.timeline.activeFrame.addClip(inner);
            outer.timeline.addFrame(new Wick.Frame({start: 2}));

            project.activeFrame.addClip(outer);
            outer.isGraphic = true;
            inner.isGraphic = true;

            let seen = [];
            [0, 0.2, 0.3, 0.45].forEach(f => {
                project._withGraphicSubframe(f, () => {
                    seen.push([outer.timeline.playheadPosition, inner.timeline.playheadPosition]);
                });
            });
            // outer frame 1 covers 0..0.5, and inner shows its own 2 frames within that outer frame.
            expect(seen).to.deep.equal([[1, 1], [1, 1], [1, 2], [1, 2]]);
        });
    });

    describe('Sampling is visual only', function () {
        it('should restore the real playheads after sampling', function () {
            let {project, clip} = makeProject(2, 1);
            project.activeTimeline.playheadPosition = 1;
            let before = clip.timeline.playheadPosition;
            project._withGraphicSubframe(0.75, () => {
                expect(clip.timeline.playheadPosition).to.equal(2);
            });
            expect(clip.timeline.playheadPosition).to.equal(before);
            expect(project.activeTimeline.playheadPosition).to.equal(1);
            expect(project.activeTimeline.subframe).to.equal(0);
            expect(clip.timeline.subframe).to.equal(0);
        });

        it('should render a different internal frame in the second half of a parent frame', function () {
            let {project, clip, frames} = makeProject(2, 1);
            project.view.render();

            let rendered = [];
            [0.1, 0.6].forEach(f => {
                project._withGraphicSubframe(f, () => {
                    project.view.render();
                    let layerIds = clip.view.group.children.map(c => c.data.wickUUID);
                    rendered.push(layerIds);
                });
            });
            expect(rendered[0]).to.include(frames[0].uuid);
            expect(rendered[0]).to.not.include(frames[1].uuid);
            expect(rendered[1]).to.include(frames[1].uuid);
            expect(rendered[1]).to.not.include(frames[0].uuid);
        });

        it('should not run frame scripts again when sampling subframes', function () {
            let {project, clip, frames} = makeProject(2, 1);
            let count = 0;
            window.__graphicScriptCount = 0;
            frames[1].addScript('load', 'window.__graphicScriptCount++;');

            project.tick();
            let afterTick = window.__graphicScriptCount;
            [0.1, 0.4, 0.6, 0.9].forEach(f => project.renderSubframe(f, true));
            expect(window.__graphicScriptCount).to.equal(afterTick);
            delete window.__graphicScriptCount;
        });

        it('should skip rendering when no graphic frame would change', function () {
            let {project} = makeProject(2, 1);
            project.renderSubframe(0.1, true);
            expect(project.renderSubframe(0.2)).to.equal(false);
            expect(project.renderSubframe(0.6)).to.equal(true);
            expect(project.renderSubframe(0.8)).to.equal(false);
        });

        it('should not render subframes for a project with no graphics', function () {
            let project = new Wick.Project();
            project.activeFrame.addClip(new Wick.Clip());
            expect(project.renderSubframe(0.5, true)).to.equal(false);
        });
    });

    describe('Playback', function () {
        it('should advance the parent one frame per tick and show both internal frames within it', function (done) {
            let {project, clip} = makeProject(2, 3);
            project.activeFrame.end = 3;
            project.framerate = 30;

            let seenInFirstParentFrame = new Set();
            let ticks = 0;
            let originalRender = project.view.render.bind(project.view);
            project.view.render = function () {
                if (project.activeTimeline.playheadPosition === 1) {
                    seenInFirstParentFrame.add(clip.timeline.playheadPosition);
                }
                return originalRender();
            };

            project.play({
                onAfterTick: () => {
                    ticks++;
                    expect(project.activeTimeline.playheadPosition).to.equal(((ticks) % 3) + 1);
                    if (ticks === 3) {
                        project.stop();
                        project.view.render = originalRender;
                        done();
                    }
                }
            });
        });
    });

    describe('Existing behavior', function () {
        it('should leave a normal clip untouched by subframe sampling', function () {
            let project = new Wick.Project();
            let clip = new Wick.Clip();
            clip.timeline.addFrame(new Wick.Frame({start: 2}));
            project.activeFrame.addClip(clip);
            clip.timeline.playheadPosition = 2;

            project._withGraphicSubframe(0.7, () => {
                expect(clip.timeline.playheadPosition).to.equal(2);
            });
            expect(clip.timeline.playheadPosition).to.equal(2);
        });

        it('should keep tweens working inside a graphic', function () {
            let {project, clip} = makeProject(2, 2);
            let tweenFrame = clip.timeline.activeFrame;
            tweenFrame.end = 2;
            let child = new Wick.Clip();
            child.transformation.x = 0;
            tweenFrame.addClip(child);
            tweenFrame.addTween(new Wick.Tween({playheadPosition: 1, transformation: new Wick.Transformation({x: 0, y: 0})}));
            tweenFrame.addTween(new Wick.Tween({playheadPosition: 2, transformation: new Wick.Transformation({x: 100, y: 0})}));
            project.activeTimeline.playheadPosition = 2;
            expect(child.transformation.x).to.be.within(0, 100);
        });
    });
});
