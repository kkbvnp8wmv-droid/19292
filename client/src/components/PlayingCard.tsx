import React from 'react';
import { cardParts } from '../lib/format';

export function PlayingCard({
  card,
  size = 'md',
  className = '',
  delay = 0,
  flip = false,
}: {
  card: string;
  size?: 'sm' | 'md' | 'lg' | 'seat';
  className?: string;
  delay?: number;
  flip?: boolean;
}) {
  const p = cardParts(card);
  const sizeClass = size === 'md' ? '' : size;
  const style = delay ? { animationDelay: `${delay}ms` } : undefined;
  if (p.hidden) {
    return <div className={`pcard ${sizeClass} back ${className}`} style={style} aria-label="蓋住的牌" />;
  }
  return (
    <div
      className={`pcard ${p.red ? 'red' : ''} ${sizeClass} ${flip ? 'flip' : ''} ${className}`}
      style={style}
      aria-label={`${p.rank}${p.suit}`}
    >
      <span className="r">{p.rank}</span>
      <span className="s">{p.suit}</span>
    </div>
  );
}

export function CardFan({ cards, size = 'md' as 'sm' | 'md' | 'lg' }: { cards: string[]; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="card-fan">
      {cards.map((c, i) => (
        <PlayingCard key={`${c}-${i}`} card={c} size={size} className="dealt" delay={i * 70} />
      ))}
    </div>
  );
}
