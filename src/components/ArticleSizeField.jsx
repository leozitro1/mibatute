import { ARTICLE_SIZES } from '../data/articleSizes.js';
import './ArticleSizeField.css';

export default function ArticleSizeField({ value, onChange, disabled, name }) {
  return <fieldset className="article-size-field" disabled={disabled}>
    <legend>Tamaño aproximado <span>(opcional)</span></legend>
    <p>Ayuda a planear la recogida. No es una medida de peso.</p>
    <div className="article-size-options">
      {ARTICLE_SIZES.map(size => <label key={size.value}>
        <input type="radio" name={name} value={size.value} checked={value === size.value} onChange={() => onChange(size.value)} />
        <span><strong>{size.label}</strong><small>{size.description}</small></span>
      </label>)}
    </div>
    {value && <button type="button" onClick={() => onChange('')}>Quitar selección</button>}
  </fieldset>;
}
