import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveDonationDeliveryStatus,
  normalizeDonationModality,
  normalizeInKindCategory,
  validateOfferedDonation,
} from './donation-traceability';

describe('KIR-30 (KIR-46 / KIR-47 / KIR-49): Registro de donación ofrecida - Reglas unitarias', () => {
  it('KIR-46: Normaliza modalidad de entrega y categoría de bienes en especie', () => {
    assert.equal(normalizeDonationModality(undefined, 'economica'), 'transferencia_qr');
    assert.equal(normalizeDonationModality(undefined, 'especie'), 'entrega_centro_acopio');
    assert.equal(normalizeDonationModality('recojo_domicilio', 'especie'), 'recojo_domicilio');
    assert.equal(normalizeInKindCategory('alimentos'), 'alimentos');
    assert.equal(normalizeInKindCategory('desconocido'), 'otros');
    assert.equal(normalizeInKindCategory(''), null);
  });

  it('KIR-46 & KIR-49: Valida donación económica ofrecida por donante identificado', () => {
    const res = validateOfferedDonation(
      {
        donante_nombre: 'Valeria Mendoza',
        donante_tipo: 'persona',
        donante_email: 'Valeria@Correo.COM',
        donante_ciudad: 'La Paz',
        tipo_donacion: 'economica',
        monto_bob: 350.5,
        modalidad_entrega: 'transferencia_qr',
        fecha_disponible_estimada: '2026-12-01',
      },
      '2026-11-24'
    );

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.donante_nombre, 'Valeria Mendoza');
      assert.equal(res.data.donante_email, 'valeria@correo.com');
      assert.equal(res.data.monto_bob, 350.5);
      assert.equal(res.data.modalidad_entrega, 'transferencia_qr');
      assert.equal(res.data.fecha_disponible_estimada, '2026-12-01');
    }
  });

  it('KIR-46 & KIR-49: Permite donante anónimo sin correo ni teléfono y asigna etiqueta estándar', () => {
    const res = validateOfferedDonation({
      donante_tipo: 'anonimo',
      tipo_donacion: 'economica',
      monto_bob: 100,
    });

    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.donante_nombre, 'Donante Anónimo');
      assert.equal(res.data.donante_tipo, 'anonimo');
      assert.equal(res.data.monto_bob, 100);
    }
  });

  it('KIR-47 & KIR-49: Valida donación en especie con recojo a domicilio y rechaza campos inválidos', () => {
    // Sin dirección en recojo_domicilio -> error
    const missingAddress = validateOfferedDonation({
      donante_nombre: 'Empresa Solidaria',
      donante_tipo: 'empresa',
      donante_telefono: '+591 71112233',
      tipo_donacion: 'especie',
      descripcion_especie: '20 frazadas térmicas nuevas',
      categoria_especie: 'ropa_abrigo',
      cantidad_especie: 20,
      modalidad_entrega: 'recojo_domicilio',
    });
    assert.equal(missingAddress.ok, false);

    // Monto económico inválido -> error
    const invalidAmount = validateOfferedDonation({
      donante_nombre: 'Carlos Ruiz',
      donante_email: 'carlos@test.com',
      tipo_donacion: 'economica',
      monto_bob: 0,
    });
    assert.equal(invalidAmount.ok, false);

    // Fecha pasada -> error
    const pastDate = validateOfferedDonation(
      {
        donante_nombre: 'Carlos Ruiz',
        donante_email: 'carlos@test.com',
        tipo_donacion: 'economica',
        monto_bob: 150,
        fecha_disponible_estimada: '2026-11-20',
      },
      '2026-11-24'
    );
    assert.equal(pastDate.ok, false);

    // Donación en especie completa -> válida
    const validInKind = validateOfferedDonation({
      donante_nombre: 'Empresa Solidaria',
      donante_tipo: 'empresa',
      donante_telefono: '+591 71112233',
      tipo_donacion: 'especie',
      descripcion_especie: '20 frazadas térmicas nuevas',
      categoria_especie: 'ropa_abrigo',
      cantidad_especie: 20,
      modalidad_entrega: 'recojo_domicilio',
      direccion_recojo: 'Av. Arce #2140, Sopocachi, La Paz',
    });
    assert.equal(validInKind.ok, true);
    if (validInKind.ok) {
      assert.equal(validInKind.data.categoria_especie, 'ropa_abrigo');
      assert.equal(validInKind.data.cantidad_especie, 20);
      assert.equal(validInKind.data.direccion_recojo, 'Av. Arce #2140, Sopocachi, La Paz');
    }
  });

  it('KIR-47: Preserva el estado "ofrecida" cuando aún no existen entregas ni confirmación', () => {
    assert.equal(deriveDonationDeliveryStatus('economica', 500, [], 'ofrecida'), 'ofrecida');
    assert.equal(deriveDonationDeliveryStatus('economica', 500, [], 'recibida'), 'recibida');
  });
});
