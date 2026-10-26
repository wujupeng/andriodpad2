/**
 * C-07 Spinner（design.md 2.3.2）
 * 24px 圆环旋转 800ms/圈，颜色 currentColor 继承；
 * 仅用于"进行中"语义，禁止与 success/danger 图标混用位置（spec 5.7.1-R7）。
 */
import { Icon } from '../../icons/Icon';

export interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 24 }: SpinnerProps) {
  return <Icon name="icon-loader" size={size} />;
}