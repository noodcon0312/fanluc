import React from "react";

const FONTS = [
  "'Courier Prime', monospace",
  "'VT323', monospace",
  "'Share Tech Mono', monospace",
  "'Inconsolata', monospace",
];

/**
 * Returns a React element containing individual <span>s for every character in the string,
 * each styled with a randomly picked font among Courier Prime, VT323, Share Tech Mono, and Inconsolata.
 */
export function renderRandomFontText(text: string, seedOffset: number = 0): React.ReactNode {
  if (text === null || text === undefined) return null;
  const str = String(text);
  if (!str) return null;

  return (
    <>
      {str.split("").map((char, index) => {
        // High-mixing hash function for truly randomized font distribution per character
        let h = (index + 1) * 2654435761 + char.charCodeAt(0) * 1597334677 + seedOffset * 3828383;
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        const fontIndex = Math.abs(h ^ (h >>> 16)) % FONTS.length;
        const selectedFont = FONTS[fontIndex];

        return (
          <span key={index} style={{ fontFamily: selectedFont }}>
            {char}
          </span>
        );
      })}
    </>
  );
}

interface RandomFontTextProps {
  text?: string | number | null;
  children?: React.ReactNode;
  className?: string;
  seedOffset?: number;
}

export const RandomFontText: React.FC<RandomFontTextProps> = ({
  text,
  children,
  className = "",
  seedOffset = 0,
}) => {
  if (text !== undefined && text !== null) {
    return <span className={className}>{renderRandomFontText(String(text), seedOffset)}</span>;
  }

  const renderChildren = (node: React.ReactNode): React.ReactNode => {
    if (typeof node === "string" || typeof node === "number") {
      return renderRandomFontText(String(node), seedOffset);
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={idx}>{renderChildren(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(node)) {
      const element = node as React.ReactElement<any>;
      if (element.props && element.props.children) {
        return React.cloneElement(
          element,
          { ...element.props, children: undefined },
          renderChildren(element.props.children)
        );
      }
    }
    return node;
  };

  return <span className={className}>{renderChildren(children)}</span>;
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  placeholderText?: string;
  inputClassName?: string;
}

export const RandomFontInput: React.FC<InputProps> = ({
  placeholderText,
  value,
  className = "",
  inputClassName = "",
  type = "text",
  placeholder,
  ...props
}) => {
  return (
    <input
      {...props}
      type={type}
      value={value}
      placeholder={placeholder || placeholderText}
      className={`w-full font-mono text-xs text-black dark:text-white bg-white dark:bg-black caret-black dark:caret-white placeholder:text-black/40 dark:placeholder:text-white/40 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black focus:outline-none ${inputClassName} ${className}`}
    />
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  placeholderText?: string;
  textareaClassName?: string;
}

export const RandomFontTextarea: React.FC<TextareaProps> = ({
  placeholderText,
  value,
  className = "",
  textareaClassName = "",
  rows = 3,
  placeholder,
  ...props
}) => {
  return (
    <textarea
      {...props}
      value={value}
      rows={rows}
      placeholder={placeholder || placeholderText}
      className={`w-full font-mono text-xs text-black dark:text-white bg-white dark:bg-black caret-black dark:caret-white placeholder:text-black/40 dark:placeholder:text-white/40 selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black focus:outline-none resize-y leading-relaxed ${textareaClassName} ${className}`}
    />
  );
};
