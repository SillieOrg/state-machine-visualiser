import { describe, it, expect } from 'vitest';
import { Position } from '@xyflow/react';
import { pickAutoSides, getSidePoint, pointOnCubicPath, getLabelT, type Rect } from './edgeAnchors';

const rect = (x: number, y: number, width = 200, height = 60): Rect => ({ x, y, width, height });

describe('pickAutoSides', () => {
  describe('vertical preference (hierarchical)', () => {
    it('leaves from the bottom when the target is below', () => {
      expect(pickAutoSides(rect(0, 0), rect(0, 140))).toEqual({ source: Position.Bottom, target: Position.Top });
    });

    it('leaves from the bottom even when the target is far to the side', () => {
      expect(pickAutoSides(rect(0, 0), rect(900, 140))).toEqual({ source: Position.Bottom, target: Position.Top });
    });

    it('leaves from the top when the target is above', () => {
      expect(pickAutoSides(rect(0, 300), rect(50, 0))).toEqual({ source: Position.Top, target: Position.Bottom });
    });

    it('uses left/right when nodes share a row', () => {
      expect(pickAutoSides(rect(0, 0), rect(300, 10))).toEqual({ source: Position.Right, target: Position.Left });
      expect(pickAutoSides(rect(300, 10), rect(0, 0))).toEqual({ source: Position.Left, target: Position.Right });
    });

    it('falls back to bottom/top when nodes overlap', () => {
      expect(pickAutoSides(rect(0, 0), rect(10, 10))).toEqual({ source: Position.Bottom, target: Position.Top });
    });
  });

  describe('horizontal preference (grid)', () => {
    it('leaves from the right when the target is to the right', () => {
      expect(pickAutoSides(rect(0, 0), rect(300, 400), 'horizontal')).toEqual({ source: Position.Right, target: Position.Left });
    });

    it('leaves from the left when the target is to the left', () => {
      expect(pickAutoSides(rect(300, 0), rect(0, 0), 'horizontal')).toEqual({ source: Position.Left, target: Position.Right });
    });

    it('uses top/bottom when nodes share a column', () => {
      expect(pickAutoSides(rect(0, 0), rect(50, 200), 'horizontal')).toEqual({ source: Position.Bottom, target: Position.Top });
    });
  });
});

describe('getSidePoint', () => {
  const r = rect(10, 20, 100, 40);
  it('returns the midpoint of each side', () => {
    expect(getSidePoint(r, Position.Top)).toEqual({ x: 60, y: 20 });
    expect(getSidePoint(r, Position.Right)).toEqual({ x: 110, y: 40 });
    expect(getSidePoint(r, Position.Bottom)).toEqual({ x: 60, y: 60 });
    expect(getSidePoint(r, Position.Left)).toEqual({ x: 10, y: 40 });
  });
});

describe('pointOnCubicPath', () => {
  const path = 'M0,0 C0,50 100,50 100,100';
  it('returns endpoints and midpoint', () => {
    expect(pointOnCubicPath(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointOnCubicPath(path, 1)).toEqual({ x: 100, y: 100 });
    expect(pointOnCubicPath(path, 0.5)).toEqual({ x: 50, y: 50 });
  });

  it('returns null for non-cubic paths', () => {
    expect(pointOnCubicPath('M0,0 Q50,50 100,100', 0.5)).toBeNull();
    expect(pointOnCubicPath('M0,0 L50,0 L50,100', 0.5)).toBeNull();
  });
});

describe('getLabelT', () => {
  it('moves labels away from the side where edges bunch up', () => {
    expect(getLabelT(1, 1)).toBe(0.5);
    expect(getLabelT(4, 1)).toBeGreaterThan(0.5);
    expect(getLabelT(1, 3)).toBeLessThan(0.5);
  });
});
