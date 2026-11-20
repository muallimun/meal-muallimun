import React from 'react';

interface FormattedStemProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Soru köklerindeki `**kalın**` vurguları ve paragraf (`\n\n`) ayrımını güvenli React düğümleriyle işler.
 */
export const FormattedStem: React.FC<FormattedStemProps> = ({ text, className, style }) => {
  const paragraphs = text.split(/\n{2,}/);

  const renderInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={idx} className="font-extrabold underline decoration-teal-600/35 underline-offset-2">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className={className} style={style}>
      {paragraphs.map((para, pIdx) => {
        const lines = para.split('\n');
        return (
          <p key={pIdx} className={pIdx > 0 ? 'mt-2.5' : undefined}>
            {lines.map((line, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
};
