'use client';

import * as anime from 'animejs';
import { useEffect, useRef } from 'react';

export function AnimatedTitle() {
  const containerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Use animejs v4 splitText functionality
    const split = anime.splitText(containerRef.current, {
      chars: {
        class:
          'inline-block min-w-[0.65em] text-center whitespace-pre will-change-[transform,opacity,filter]',
      },
    });

    const chars = split.chars;

    // Store original text for animations that need it (like Cypher)
    chars.forEach((el) => {
      el.setAttribute('data-orig', el.textContent || '');
    });

    // Randomly pick one of the 4 animations
    const animationIndex = Math.floor(Math.random() * 4);

    switch (animationIndex) {
      case 0: // Ghostly Reveal
        anime.animate(chars, {
          opacity: [0, 1],
          filter: ['blur(15px)', 'blur(0px)'],
          translateY: [20, 0],
          duration: 1500,
          delay: anime.stagger(100),
          ease: 'outExpo',
        });
        break;

      case 1: {
        // Cypher Stream
        const charsList = 'ABCDEFGHJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
        chars.forEach((el, i) => {
          const finalChar = el.getAttribute('data-orig');
          const state = { val: 0 };
          el.style.opacity = '0';

          anime.animate(state, {
            val: 10,
            duration: 500 + i * 120,
            ease: 'linear',
            onUpdate: () => {
              if (state.val < 9) {
                el.innerText =
                  charsList[Math.floor(Math.random() * charsList.length)];
                el.style.opacity = '0.5';
              } else {
                el.innerText = finalChar || '';
                el.style.opacity = '1';
              }
            },
          });
        });
        break;
      }

      case 2: // Ethereal Drift
        anime.animate(chars, {
          translateY: [40, 0],
          opacity: [0, 1],
          duration: 1200,
          delay: anime.stagger(100),
          ease: 'outElastic(1, .6)',
          onComplete: () => {
            anime.animate(chars, {
              keyframes: [
                { translateY: -8, duration: 2000 },
                { translateY: 0, duration: 2000 },
              ],
              ease: 'inOutSine',
              delay: anime.stagger(200),
              loop: true,
            });
          },
        });
        break;

      case 3: {
        // Kinetic Shift
        anime.animate(chars, {
          translateX: 100,
          opacity: 0,
          rotateY: 0,
          duration: 0,
        });

        const tl = anime.createTimeline();
        tl.add(chars, {
          translateX: [100, 0],
          opacity: [0, 1],
          ease: 'outExpo',
          duration: 800,
          delay: anime.stagger(50),
        })
          .add(
            chars,
            {
              rotateY: [0, 360],
              duration: 1000,
              ease: 'outElastic(1, .8)',
              delay: anime.stagger(40),
            },
            '-=400',
          )
          .play();
        break;
      }
    }

    return () => {
      anime.remove(chars);
    };
  }, []);

  return (
    <h1
      ref={containerRef}
      className="text-xl sm:text-2xl font-bold tracking-widest uppercase select-none">
      whisper
    </h1>
  );
}
