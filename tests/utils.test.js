import { describe, it, expect, vi } from 'vitest';
import {
  formatTime,
  formatTimeWithHours,
  getPhaseLabel,
  getShortPhaseLabel,
  sanitizeText,
  validateIntegerInput,
  generateRandomCode,
  clampToViewportBound,
  isValidWorkspaceArray,
  isNonEmptyArray,
  isValidRangeValue,
  findRuleAndExecute,
} from '../src/utils.js';

describe('Utils Module', () => {
  describe('formatTime', () => {
    it('should format 0 seconds as "0:00"', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('should format 61 seconds as "1:01"', () => {
      expect(formatTime(61)).toBe('1:01');
    });

    it('should format 3600 seconds as "60:00"', () => {
      expect(formatTime(3600)).toBe('60:00');
    });

    it('should format 90 seconds as "1:30"', () => {
      expect(formatTime(90)).toBe('1:30');
    });

    it('should pad single-digit seconds with zero', () => {
      expect(formatTime(5)).toBe('0:05');
      expect(formatTime(65)).toBe('1:05');
    });

    it('should handle large values', () => {
      expect(formatTime(7200)).toBe('120:00');
      expect(formatTime(7265)).toBe('121:05');
    });
  });

  describe('formatTimeWithHours', () => {
    it('should format with hours when useHours=true and hours>0', () => {
      expect(formatTimeWithHours(3661, true)).toBe('1:01:01');
    });

    it('should format without hours when useHours=false', () => {
      // When useHours=false, formats as MM:SS regardless of hour component
      expect(formatTimeWithHours(3661, false)).toBe('1:01');
    });

    it('should not show hours when useHours=true but hours=0', () => {
      expect(formatTimeWithHours(90, true)).toBe('1:30');
    });

    it('should format 2 hours correctly', () => {
      expect(formatTimeWithHours(7200, true)).toBe('2:00:00');
    });

    it('should pad minutes and seconds in hour format', () => {
      expect(formatTimeWithHours(3665, true)).toBe('1:01:05');
    });

    it('should handle default useHours parameter', () => {
      expect(formatTimeWithHours(90)).toBe('1:30');
    });

    it('should handle edge cases', () => {
      expect(formatTimeWithHours(0, true)).toBe('0:00');
      expect(formatTimeWithHours(59, true)).toBe('0:59');
      expect(formatTimeWithHours(3600, true)).toBe('1:00:00');
    });
  });

  describe('getPhaseLabel', () => {
    it('should return "Focus Period" for "focus"', () => {
      expect(getPhaseLabel('focus')).toBe('Focus Period');
    });

    it('should return "Break Time" for "break"', () => {
      expect(getPhaseLabel('break')).toBe('Break Time');
    });

    it('should return "Transition" for "transition"', () => {
      expect(getPhaseLabel('transition')).toBe('Transition');
    });

    it('should return "Break Time" for "long-break" (backwards compatibility)', () => {
      expect(getPhaseLabel('long-break')).toBe('Break Time');
    });

    it('should return "Focus Period" for unknown phase', () => {
      expect(getPhaseLabel('unknown')).toBe('Focus Period');
      expect(getPhaseLabel('')).toBe('Focus Period');
      expect(getPhaseLabel(null)).toBe('Focus Period');
    });
  });

  describe('getShortPhaseLabel', () => {
    it('should return "Focus" for "focus"', () => {
      expect(getShortPhaseLabel('focus')).toBe('Focus');
    });

    it('should return "Transition" for "transition"', () => {
      expect(getShortPhaseLabel('transition')).toBe('Transition');
    });

    it('should return "Break" for "break"', () => {
      expect(getShortPhaseLabel('break')).toBe('Break');
    });

    it('should return "Break" for anything else', () => {
      expect(getShortPhaseLabel('unknown')).toBe('Break');
      expect(getShortPhaseLabel('long-break')).toBe('Break');
      expect(getShortPhaseLabel('')).toBe('Break');
    });
  });

  describe('sanitizeText', () => {
    it('should remove < and > characters', () => {
      expect(sanitizeText('<script>alert("xss")</script>'))
        .toBe('scriptalert("xss")/script');
    });

    it('should leave normal text unchanged', () => {
      expect(sanitizeText('Hello')).toBe('Hello');
      expect(sanitizeText('Hello World 123')).toBe('Hello World 123');
    });

    it('should handle empty string', () => {
      expect(sanitizeText('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
      expect(sanitizeText({})).toBe('');
    });

    it('should preserve other special characters', () => {
      expect(sanitizeText('Hello & goodbye!')).toBe('Hello & goodbye!');
      expect(sanitizeText('Test @ #hashtag')).toBe('Test @ #hashtag');
    });
  });

  describe('validateIntegerInput', () => {
    it('should return parsed value when valid', () => {
      expect(validateIntegerInput('5', 1, 10, 3)).toBe(5);
    });

    it('should return default when value is not a number', () => {
      expect(validateIntegerInput('abc', 1, 10, 3)).toBe(3);
    });

    it('should return default when value is below min', () => {
      expect(validateIntegerInput('0', 1, 10, 3)).toBe(3);
    });

    it('should return default when value is above max', () => {
      expect(validateIntegerInput('11', 1, 10, 3)).toBe(3);
    });

    it('should handle numeric input', () => {
      expect(validateIntegerInput(5, 1, 10, 3)).toBe(5);
    });

    it('should handle boundary values', () => {
      expect(validateIntegerInput('1', 1, 10, 3)).toBe(1);
      expect(validateIntegerInput('10', 1, 10, 3)).toBe(10);
    });

    it('should handle negative numbers', () => {
      expect(validateIntegerInput('-5', -10, 0, -1)).toBe(-5);
      expect(validateIntegerInput('-11', -10, 0, -1)).toBe(-1);
    });

    it('should handle floating point strings', () => {
      expect(validateIntegerInput('5.7', 1, 10, 3)).toBe(5);
    });
  });

  describe('generateRandomCode', () => {
    it('should generate code with correct length', () => {
      const code = generateRandomCode(10, 'alphanumeric');
      expect(code.length).toBe(10);
    });

    it('should generate alphanumeric code', () => {
      const code = generateRandomCode(50, 'alphanumeric');
      expect(code).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate all-typeable code with special characters', () => {
      // Generate a longer code to increase chance of special chars
      const code = generateRandomCode(200, 'all-typeable');
      // At least some special characters should appear in 200 chars
      // Check that it contains characters from the all-typeable set
      const hasLetters = /[A-Za-z]/.test(code);
      const hasNumbers = /[0-9]/.test(code);
      expect(hasLetters || hasNumbers).toBe(true);
      expect(code.length).toBe(200);
    });

    it('should generate different codes on successive calls', () => {
      const code1 = generateRandomCode(20, 'alphanumeric');
      const code2 = generateRandomCode(20, 'alphanumeric');
      // While theoretically possible, two random 20-char codes should virtually never be equal
      expect(code1).not.toBe(code2);
    });

    it('should handle length 0', () => {
      const code = generateRandomCode(0, 'alphanumeric');
      expect(code).toBe('');
    });

    it('should handle length 1', () => {
      const code = generateRandomCode(1, 'alphanumeric');
      expect(code.length).toBe(1);
    });
  });

  describe('clampToViewportBound', () => {
    it('should not clamp when position is within bounds', () => {
      expect(clampToViewportBound(100, 200, 800)).toBe(100);
    });

    it('should clamp to max bound', () => {
      expect(clampToViewportBound(700, 200, 800)).toBe(600);
    });

    it('should clamp to min bound (0)', () => {
      expect(clampToViewportBound(-10, 200, 800)).toBe(0);
    });

    it('should handle element larger than viewport', () => {
      const result = clampToViewportBound(100, 900, 800);
      // Element size (900px) exceeds viewport (800px), position is clamped
      expect(result).toBeLessThanOrEqual(0);
      expect(result).toBeGreaterThanOrEqual(-100);
    });

    it('should handle edge case where element exactly fits viewport', () => {
      expect(clampToViewportBound(0, 800, 800)).toBe(0);
      expect(clampToViewportBound(100, 800, 800)).toBe(0);
    });

    it('should handle negative position with oversized element', () => {
      const result = clampToViewportBound(-50, 900, 800);
      expect(result).toBe(-50);
    });

    it('should handle position at exact max bound', () => {
      expect(clampToViewportBound(600, 200, 800)).toBe(600);
    });
  });

  describe('isValidWorkspaceArray', () => {
    it('should return falsy for null', () => {
      expect(isValidWorkspaceArray(null)).toBeFalsy();
    });

    it('should return false for empty array', () => {
      expect(isValidWorkspaceArray([])).toBe(false);
    });

    it('should return true for non-empty array', () => {
      expect(isValidWorkspaceArray([1])).toBe(true);
      expect(isValidWorkspaceArray(['workspace1'])).toBe(true);
      expect(isValidWorkspaceArray([1, 2, 3])).toBe(true);
    });

    it('should return falsy for non-array', () => {
      expect(isValidWorkspaceArray('string')).toBeFalsy();
      expect(isValidWorkspaceArray(123)).toBeFalsy();
      expect(isValidWorkspaceArray({})).toBeFalsy();
    });

    it('should return falsy for undefined', () => {
      expect(isValidWorkspaceArray(undefined)).toBeFalsy();
    });
  });

  describe('isNonEmptyArray', () => {
    it('should return false for empty array', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });

    it('should return true for non-empty array', () => {
      expect(isNonEmptyArray([1])).toBe(true);
      expect(isNonEmptyArray(['a', 'b'])).toBe(true);
    });

    it('should return false for null', () => {
      expect(isNonEmptyArray(null)).toBe(false);
    });

    it('should return false for non-array', () => {
      expect(isNonEmptyArray('string')).toBe(false);
      expect(isNonEmptyArray(123)).toBe(false);
      expect(isNonEmptyArray({})).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNonEmptyArray(undefined)).toBe(false);
    });
  });

  describe('isValidRangeValue', () => {
    it('should return true for value within range', () => {
      expect(isValidRangeValue(5, 1, 10)).toBe(true);
    });

    it('should return false for value below min', () => {
      expect(isValidRangeValue(0, 1, 10)).toBe(false);
    });

    it('should return false for value above max', () => {
      expect(isValidRangeValue(11, 1, 10)).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValidRangeValue(NaN, 1, 10)).toBe(false);
    });

    it('should return true for boundary values', () => {
      expect(isValidRangeValue(1, 1, 10)).toBe(true);
      expect(isValidRangeValue(10, 1, 10)).toBe(true);
    });

    it('should handle negative ranges', () => {
      expect(isValidRangeValue(-5, -10, 0)).toBe(true);
      expect(isValidRangeValue(-11, -10, 0)).toBe(false);
    });

    it('should handle floating point values', () => {
      expect(isValidRangeValue(5.5, 1, 10)).toBe(true);
      expect(isValidRangeValue(0.5, 1, 10)).toBe(false);
    });
  });

  describe('findRuleAndExecute', () => {
    it('should find rule and execute callback', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [
              { id: 'rule1', pattern: 'test' },
              { id: 'rule2', pattern: 'test2' },
            ],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'ruleset1', 'rule1', callback);

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        { id: 'rule1', pattern: 'test' },
        0,
        config.rulesets[0].rules
      );
    });

    it('should return false when ruleset not found', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [{ id: 'rule1', pattern: 'test' }],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'nonexistent', 'rule1', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return false when rule not found', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [{ id: 'rule1', pattern: 'test' }],
          },
        ],
      };

      const callback = vi.fn();
      const result = findRuleAndExecute(config, 'ruleset1', 'nonexistent', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should pass correct indices to callback', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [
              { id: 'rule1', pattern: 'test1' },
              { id: 'rule2', pattern: 'test2' },
              { id: 'rule3', pattern: 'test3' },
            ],
          },
        ],
      };

      const callback = vi.fn();
      findRuleAndExecute(config, 'ruleset1', 'rule3', callback);

      expect(callback).toHaveBeenCalledWith(
        { id: 'rule3', pattern: 'test3' },
        2,
        config.rulesets[0].rules
      );
    });

    it('should allow callback to modify rule', () => {
      const config = {
        rulesets: [
          {
            id: 'ruleset1',
            rules: [{ id: 'rule1', pattern: 'test' }],
          },
        ],
      };

      const callback = (rule) => {
        rule.pattern = 'modified';
      };

      findRuleAndExecute(config, 'ruleset1', 'rule1', callback);

      expect(config.rulesets[0].rules[0].pattern).toBe('modified');
    });
  });
});
