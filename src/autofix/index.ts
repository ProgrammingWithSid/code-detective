/**
 * Auto-Fix Module
 *
 * Generates and applies code fixes automatically
 */

export { FixGenerator, createFixGenerator } from './fix-generator';

export { FixApplier, createFixApplier } from './fix-applier';

export {
  AutoFix,
  createAutoFix,
  createDefaultAutoFix,
  type AutoFixOptions,
} from './autofix-service';
