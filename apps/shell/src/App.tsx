import { AppShell, Avatar, Burger, Button, Center, Group, Loader, NavLink, ScrollArea, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useCallback, useEffect, useState } from 'react';
import { crearApi, NoAutenticadoError, URL_LOGIN, type Modulo, type Usuario } from './api.js';
import { agruparPorSeccion, iniciales, moduloSeleccionado } from './menu.js';

const api = crearApi();

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; usuario: Usuario; modulos: Modulo[] };

export function App() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [actual, setActual] = useState<Modulo | null>(null);
  const [abierto, { toggle, close }] = useDisclosure();

  useEffect(() => {
    Promise.all([api.usuario(), api.modulos()])
      .then(([usuario, modulos]) => {
        setEstado({ tipo: 'listo', usuario, modulos });
        setActual(moduloSeleccionado(window.location.search, modulos));
      })
      .catch((err: unknown) => {
        if (err instanceof NoAutenticadoError) window.location.assign(URL_LOGIN);
        else setEstado({ tipo: 'error', mensaje: err instanceof Error ? err.message : 'Error inesperado' });
      });
  }, []);

  // Navegación con el historial del navegador (atrás/adelante).
  useEffect(() => {
    const alVolver = () => {
      if (estado.tipo === 'listo') setActual(moduloSeleccionado(window.location.search, estado.modulos));
    };
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, [estado]);

  const abrir = useCallback(
    (m: Modulo | null) => {
      setActual(m);
      window.history.pushState(null, '', m ? `/?m=${encodeURIComponent(m.id)}` : '/');
      close();
    },
    [close],
  );

  const salir = async () => {
    await api.cerrarSesion();
    window.location.assign('/');
  };

  if (estado.tipo === 'cargando') {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (estado.tipo === 'error') {
    return (
      <Center h="100vh">
        <Stack align="center">
          <Text c="red">{estado.mensaje}</Text>
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
        </Stack>
      </Center>
    );
  }

  const { usuario, modulos } = estado;
  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !abierto } }} padding={0}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={abierto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menú" />
            <Title order={4} style={{ cursor: 'pointer' }} onClick={() => abrir(null)}>
              Plataforma
            </Title>
            {actual && <Text c="dimmed">/ {actual.nombre}</Text>}
          </Group>
          <Group>
            <Avatar radius="xl" size="sm" color="blue">
              {iniciales(usuario.nombre, usuario.email)}
            </Avatar>
            <Text size="sm" visibleFrom="sm">
              {usuario.nombre ?? usuario.email}
            </Text>
            <Button variant="subtle" size="xs" onClick={() => void salir()}>
              Cerrar sesión
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {agruparPorSeccion(modulos).map((s) => (
            <Stack key={s.nombre} gap={2} mb="sm">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" px="sm">
                {s.nombre}
              </Text>
              {s.modulos.map((m) => (
                <NavLink key={m.id} label={m.nombre} active={actual?.id === m.id} onClick={() => abrir(m)} />
              ))}
            </Stack>
          ))}
          {modulos.length === 0 && (
            <Text size="sm" c="dimmed" p="sm">
              Todavía no tenés módulos asignados.
            </Text>
          )}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main style={{ height: '100vh' }}>
        {actual ? (
          <iframe
            key={actual.id}
            title={actual.nombre}
            src={actual.url}
            style={{ border: 0, width: '100%', height: 'calc(100vh - 56px)', display: 'block' }}
          />
        ) : (
          <Center h="calc(100vh - 56px)">
            <Stack align="center" gap="xs">
              <Title order={3}>Hola, {usuario.nombre ?? usuario.email}</Title>
              <Text c="dimmed">
                {modulos.length > 0
                  ? 'Elegí un módulo del menú para empezar.'
                  : 'Pedile a tu Product Owner o a Sistemas acceso a los módulos que necesitás.'}
              </Text>
            </Stack>
          </Center>
        )}
      </AppShell.Main>
    </AppShell>
  );
}
