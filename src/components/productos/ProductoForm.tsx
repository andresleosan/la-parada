// src/components/productos/ProductoForm.tsx
import { useEffect, useState } from 'react';
import { Producto } from '../../types';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { FormModal } from './FormModal';
import { Timestamp } from 'firebase/firestore';
import { CheckCircle2, Heart, Image as ImageIcon, Tag, X } from 'lucide-react';
import { ImageUploadModal } from './ImageUploadModal';
import { useCategorias } from '@/hooks/useCategorias';
import { useNegocio } from '@/context/NegocioContext';
import { parseFiniteNumber, validatePositiveAmount } from '@/utils/adminInputValidation';

export interface ProductoFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Producto, 'id' | 'negocioId'>) => Promise<void>;
  initialData?: Producto;
  loading?: boolean;
}

export const ProductoForm: React.FC<ProductoFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  loading = false,
}) => {
  const { negocioActual } = useNegocio();
  const { categorias } = useCategorias();
  const [nombre, setNombre] = useState(initialData?.nombre || '');
  const [descripcion, setDescripcion] = useState(initialData?.descripcion || '');
  const [categoria, setCategoria] = useState(initialData?.categoria || '');
  const [precioStr, setPrecioStr] = useState(
    initialData?.precio ? initialData.precio.toString() : ''
  );
  const [disponible, setDisponible] = useState(initialData?.disponible !== false);
  const [destacado, setDestacado] = useState(Boolean(initialData?.destacado));
  const [imagenUrl, setImagenUrl] = useState(initialData?.imagenUrl || '');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setNombre(initialData?.nombre || '');
    setDescripcion(initialData?.descripcion || '');
    setCategoria(initialData?.categoria || '');
    setPrecioStr(initialData?.precio?.toString() || '');
    setDisponible(initialData?.disponible !== false);
    setDestacado(Boolean(initialData?.destacado));
    setImagenUrl(initialData?.imagenUrl || '');
    setErrors({});
  }, [initialData, isOpen]);

  const handleImageUpload = (imageUrl: string) => {
    setImagenUrl(imageUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!nombre.trim()) newErrors.nombre = 'El nombre es requerido';
    const precioError = validatePositiveAmount(precioStr);
    if (precioError) newErrors.precio = precioError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const precio = parseFiniteNumber(precioStr) as number;
      const now = Timestamp.now();
      const catTrimmed = categoria.trim() || undefined;
      const data: Omit<Producto, 'id' | 'negocioId'> = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        categoria: catTrimmed,
        precio,
        disponible,
        destacado,
        imagenUrl: imagenUrl || undefined,
        creadoEn: initialData?.creadoEn || now,
        actualizadoEn: now,
      };

      await onSubmit(data);

      // Limpiar form
      setNombre('');
      setDescripcion('');
      setCategoria('');
      setPrecioStr('');
      setImagenUrl('');
      setDisponible(true);
      setDestacado(false);
      setErrors({});
    } catch (err) {
      console.error('Error submitting form:', err);
    }
  };

  return (
    <FormModal
      isOpen={isOpen}
      title={initialData ? 'Editar Producto' : 'Crear Producto'}
      onClose={onClose}
      onSubmit={handleSubmit}
      loading={loading}
      submitLabel={initialData ? 'Actualizar' : 'Crear'}
    >
      <Input
        label="Nombre del Producto *"
        value={nombre}
        onChange={(e) => {
          setNombre(e.target.value);
          if (errors.nombre) setErrors({ ...errors, nombre: '' });
        }}
        placeholder="Ej: Tequeño Tradicional, Hamburguesa Doble Carne..."
        error={errors.nombre}
      />

      {/* Selector de Categoría */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
          <Tag size={14} className="text-amber-400" />
          Categoría del Producto
        </label>
        
        {/* Sugerencias Dinámicas de Categorías del Negocio */}
        <div className="flex flex-wrap gap-1.5 pb-1 max-h-24 overflow-y-auto">
          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoria(cat.nombre)}
              aria-pressed={categoria.toLowerCase().trim() === cat.nombre.toLowerCase().trim()}
              className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                categoria.toLowerCase().trim() === cat.nombre.toLowerCase().trim()
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-xs'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
              }`}
            >
              {cat.icono ? (
                <span aria-hidden="true">{cat.icono}</span>
              ) : (
                <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{cat.nombre}</span>
            </button>
          ))}
        </div>

        <Input
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          placeholder="Escribe o selecciona una categoría (ej: Tequeños, Pancerotis...)"
        />
      </div>

      <Textarea
        label="Descripción / Relleno"
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
        placeholder="Ej: Relleno de queso costeño y bocadillo, tocineta y maíz, etc."
      />

      <Input
        label="Precio en pesos (COP) *"
        type="number"
        min="1"
        step="500"
        value={precioStr}
        onChange={(e) => {
          setPrecioStr(e.target.value);
          if (errors.precio) setErrors({ ...errors, precio: '' });
        }}
        placeholder="Ej: 18000"
        error={errors.precio}
      />

      {/* Sección de Imagen */}
      <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-neutral-900/60 p-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-amber-400 flex items-center gap-2">
            <ImageIcon size={16} />
            Foto del Producto
          </label>
        </div>

        {/* Preview de imagen */}
        {imagenUrl && (
          <div className="relative group rounded-xl overflow-hidden border border-amber-500/30">
            <img
              src={imagenUrl}
              alt={nombre}
              className="w-full h-36 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <button
              type="button"
              onClick={() => setImagenUrl('')}
              className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-700"
              aria-label={`Quitar foto de ${nombre || 'producto'}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Botón para cargar imagen */}
        <button
          type="button"
          onClick={() => setIsUploadModalOpen(true)}
          disabled={!nombre.trim()}
          className="w-full py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed text-amber-400 font-medium rounded-xl flex items-center justify-center gap-2 transition text-xs border border-neutral-700 hover:border-amber-500/40"
        >
          <ImageIcon size={16} />
          {imagenUrl ? 'Cambiar foto' : 'Cargar o tomar foto'}
        </button>
      </div>

      <div className="flex items-center gap-6 pt-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="disponible"
            checked={disponible}
            onChange={(e) => setDisponible(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-900 text-amber-500 accent-amber-500"
          />
          <label htmlFor="disponible" className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-neutral-300">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Disponible
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="destacado"
            checked={destacado}
            onChange={(e) => setDestacado(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-900 text-red-500 accent-red-500"
          />
          <label htmlFor="destacado" className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-amber-400">
            <Heart className="h-3.5 w-3.5" aria-hidden="true" /> Destacado en tienda
          </label>
        </div>
      </div>

      <ImageUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onImageUpload={handleImageUpload}
        nombreProducto={nombre}
        negocioId={negocioActual.id}
        descripcionProducto={descripcion}
      />
    </FormModal>
  );
};
