$(document).ready(function () {
    const CLAVE_CARRITO = "quimfa_carrito";
    const CLAVE_TEMA = "quimfa_tema";
    const CLAVE_COLA_FIFO = "quimfa_cola_fifo_contacto";
    const TIEMPO_MAXIMO_CHECKOUT = 30;
    const TASA_IMPUESTO = 0.13;
    const TARIFA_RESERVA = 40;
    const LIMITE_BITACORA = 250;
    const EXPRESION_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const NOMBRES_LINEA = {
        todos: "Todas las Lineas Farmaceuticas",
        destacados: "Medicamentos Destacados / Alta Rotacion",
        insumos: "Insumos y Material Clinico",
        servicios: "Servicios Farmaceuticos y Asesoria",
        kits: "Kits y Paquetes Hospitalarios"
    };
    const CLASES_MATIZ = "matiz-todos matiz-destacados matiz-insumos matiz-servicios matiz-kits";
    const CLASES_LINEA = "linea-todos linea-destacados linea-insumos linea-servicios linea-kits";

    let catalogoMedicamentos = [];
    let catalogoCargado = false;
    let carritoInventario = cargarCarritoLocal();
    let categoriaActiva = "todos";
    let subcategoriaActiva = "";
    let terminoBusqueda = "";
    let modoPruebaColaFifo = false;
    let contadorEventos = 0;
    let contadorClicksUI = 0;
    let contadorBusquedasFiltros = 0;
    let contadorTransacciones = 0;
    let intervaloCheckout = null;
    let segundosRestantes = TIEMPO_MAXIMO_CHECKOUT;

    function escaparHtml(texto) {
        return String(texto)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function obtenerHoraExacta() {
        const ahora = new Date();
        const horas = String(ahora.getHours()).padStart(2, "0");
        const minutos = String(ahora.getMinutes()).padStart(2, "0");
        const segundos = String(ahora.getSeconds()).padStart(2, "0");
        return horas + ":" + minutos + ":" + segundos;
    }

    function formatearCuentaRegresiva(totalSegundos) {
        const minutos = String(Math.floor(totalSegundos / 60)).padStart(2, "0");
        const segundos = String(totalSegundos % 60).padStart(2, "0");
        return minutos + ":" + segundos;
    }

    function formatearMoneda(valor) {
        return "Bs. " + Number(valor).toFixed(2);
    }

    function cargarCarritoLocal() {
        try {
            const guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO));
            return Array.isArray(guardado) ? guardado : [];
        } catch (error) {
            return [];
        }
    }

    function guardarCarritoLocal() {
        try {
            localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carritoInventario));
        } catch (error) {
            console.error("No se pudo sincronizar el carrito con localStorage:", error);
        }
    }

    function sincronizarContadoresBitacora() {
        $("#contador-eventos-log").text(contadorEventos);
        $("#contador-eventos-menu").text(contadorEventos);
        $("#contador-eventos-clicks").text(contadorClicksUI);
        $("#contador-eventos-busquedas").text(contadorBusquedasFiltros);
        $("#contador-eventos-transacciones").text(contadorTransacciones);
    }

    function registrarEventoBitacora(origen, mensaje, categoriaMetrica, esEventoSistema) {
        if (!esEventoSistema) {
            contadorEventos++;

            if (categoriaMetrica === "busqueda") {
                contadorBusquedasFiltros++;
            } else if (categoriaMetrica === "transaccion") {
                contadorTransacciones++;
            } else {
                contadorClicksUI++;
            }
        }

        const $cabecera = $('<div class="log-cabecera"></div>')
            .append($('<span class="log-hora"></span>').text("[" + obtenerHoraExacta() + "]"))
            .append($('<span class="log-origen"></span>').text(origen));
        const $registro = $('<li class="registro-log"></li>')
            .append($cabecera)
            .append($('<div class="log-mensaje"></div>').text(mensaje));

        $("#lista-bitacora-global").prepend($registro);
        $("#lista-bitacora-global .registro-log").slice(LIMITE_BITACORA).remove();
        sincronizarContadoresBitacora();
    }

    function mostrarToast(mensaje, tipo) {
        const claseTipo = tipo ? "toast-" + tipo : "toast-info";
        const $nuevoToast = $('<div class="alerta-toast ' + claseTipo + '"></div>').text(mensaje);

        $("#contenedor-toasts").append($nuevoToast);

        $nuevoToast
            .slideDown(260)
            .delay(3000)
            .fadeOut(420, function () {
                $(this).remove();
            });
    }

    function aplicarLineaVisual(categoria) {
        const clave = NOMBRES_LINEA[categoria] ? categoria : "todos";
        $("#banner-linea").removeClass(CLASES_MATIZ).addClass("matiz-" + clave);
        $("#contenedor-tarjetas").removeClass(CLASES_LINEA).addClass("linea-" + clave);
        $("#indicador-linea-activa").html("<strong>" + NOMBRES_LINEA[clave] + "</strong>");
        $("#indicador-linea-activa").stop(true, true).css("opacity", 0.2).animate({ opacity: 1 }, 320);
    }

    function sincronizarBotonesCategoria(categoria) {
        $("#grupo-filtros-categoria .btn-filtro").removeClass("activo");
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="' + categoria + '"]').addClass("activo");
    }

    function aplicarFiltrosCatalogo() {
        let visibles = 0;
        const texto = terminoBusqueda.toLowerCase().trim();
        const tarjetas = document.querySelectorAll("#contenedor-tarjetas .tarjeta-producto");

        tarjetas.forEach(function (tarjeta) {
            const datos = tarjeta.dataset;
            const descripcion = tarjeta.querySelector(".producto-descripcion").textContent;
            const contenidoBusqueda = (datos.nombre + " " + datos.id + " " + datos.activo + " " + descripcion).toLowerCase();

            const coincideCategoria = categoriaActiva === "todos" || datos.categoria === categoriaActiva;
            const coincideSubcategoria = subcategoriaActiva === "" || datos.subcategoria === subcategoriaActiva;
            const coincideTexto = texto === "" || contenidoBusqueda.indexOf(texto) !== -1;

            if (coincideCategoria && coincideSubcategoria && coincideTexto) {
                $(tarjeta).stop(true, true).fadeIn("fast");
                visibles++;
            } else {
                $(tarjeta).stop(true, true).fadeOut("fast");
            }
        });

        const totalTarjetas = tarjetas.length;
        $("#indicador-total-catalogo").text(totalTarjetas);
        $("#indicador-visibles-catalogo").text(visibles);

        if (catalogoCargado && visibles === 0) {
            $("#mensaje-sin-resultados").stop(true, true).fadeIn("fast");
        } else {
            $("#mensaje-sin-resultados").stop(true, true).hide();
        }

        if (catalogoCargado) {
            let resumenFiltro = "Mostrando " + visibles + " de " + totalTarjetas + " items del vademecum QUIMFA";
            if (categoriaActiva !== "todos") {
                resumenFiltro += " | Linea: " + NOMBRES_LINEA[categoriaActiva];
            }
            if (subcategoriaActiva !== "") {
                resumenFiltro += " | Subcategoria: " + $("#capa2 option:selected").text();
            }
            if (texto !== "") {
                resumenFiltro += ' | Busqueda: "' + terminoBusqueda.trim() + '"';
            }
            $("#texto-estado-filtro").text(resumenFiltro + ".");
        }

        return visibles;
    }

    function ordenarTarjetasCatalogo(criterio) {
        const $contenedor = $("#contenedor-tarjetas");
        const listaTarjetas = $contenedor.children(".tarjeta-producto").get();

        listaTarjetas.sort(function (a, b) {
            if (criterio === "precio-asc") {
                return parseFloat(a.dataset.precio) - parseFloat(b.dataset.precio);
            }
            if (criterio === "precio-desc") {
                return parseFloat(b.dataset.precio) - parseFloat(a.dataset.precio);
            }
            if (criterio === "nombre-asc") {
                return String(a.dataset.nombre).localeCompare(String(b.dataset.nombre));
            }
            if (criterio === "nombre-desc") {
                return String(b.dataset.nombre).localeCompare(String(a.dataset.nombre));
            }
            return parseInt(a.dataset.orden, 10) - parseInt(b.dataset.orden, 10);
        });

        $.each(listaTarjetas, function (indice, elemento) {
            $contenedor.append(elemento);
        });
    }

    function renderizarCarrito() {
        const $lista = $("#lista-items-carrito");
        $lista.empty();

        let subtotalGeneral = 0;
        let cantidadTotalUnidades = 0;
        const cantidadLineasProductos = carritoInventario.length;

        if (cantidadLineasProductos === 0) {
            $("#carrito-vacio-mensaje").removeClass("oculto");
        } else {
            $("#carrito-vacio-mensaje").addClass("oculto");

            $.each(carritoInventario, function (indice, item) {
                const subtotalItem = item.precio * item.cantidad;
                subtotalGeneral += subtotalItem;
                cantidadTotalUnidades += item.cantidad;
                const idSeguro = escaparHtml(item.id);

                const filaHtml =
                    '<li class="item-carrito" data-id="' + idSeguro + '">' +
                        '<div class="item-carrito-info">' +
                            '<span class="item-carrito-nombre">' + escaparHtml(item.nombre) + '</span>' +
                            '<span class="item-carrito-detalle">' +
                                item.cantidad + ' x ' + formatearMoneda(item.precio) + ' = <strong>' + formatearMoneda(subtotalItem) + '</strong>' +
                            '</span>' +
                        '</div>' +
                        '<div class="item-carrito-controles">' +
                            '<button type="button" class="btn-cantidad-carrito" data-accion="disminuir" data-id="' + idSeguro + '" data-log="Carrito: Disminuir cantidad de ' + idSeguro + '">-</button>' +
                            '<button type="button" class="btn-cantidad-carrito" data-accion="incrementar" data-id="' + idSeguro + '" data-log="Carrito: Incrementar cantidad de ' + idSeguro + '">+</button>' +
                            '<button type="button" class="btn-eliminar-item" data-accion="eliminar" data-id="' + idSeguro + '" data-log="Carrito: Eliminar item ' + idSeguro + '">X</button>' +
                        '</div>' +
                    '</li>';

                $lista.append(filaHtml);
            });
        }

        const montoImpuesto = subtotalGeneral * TASA_IMPUESTO;
        const montoTotal = subtotalGeneral + montoImpuesto;

        $("#resumen-cantidad-lineas").text(cantidadLineasProductos);
        $("#resumen-cantidad-unidades").text(cantidadTotalUnidades);
        $("#carrito-subtotal").text(formatearMoneda(subtotalGeneral));
        $("#carrito-impuesto").text(formatearMoneda(montoImpuesto));
        $("#carrito-total").text(formatearMoneda(montoTotal));
        $("#carrito-total").stop(true, true).animate({ opacity: 0.3 }, 150).animate({ opacity: 1 }, 200);

        $("#modal-unidades-confirmar").text(cantidadTotalUnidades);
        $("#modal-total-confirmar").text(formatearMoneda(montoTotal));

        $("#badge-cantidad-carrito").text(cantidadTotalUnidades);

        guardarCarritoLocal();
    }

    function agregarProductoAlCarrito(producto, cantidadSolicitada) {
        const cantidad = cantidadSolicitada || 1;
        const stockMaximo = producto.stock ? Number(producto.stock) : null;
        const existente = carritoInventario.find(function (item) {
            return item.id === producto.id;
        });

        if (existente) {
            if (stockMaximo !== null && existente.cantidad + cantidad > stockMaximo) {
                mostrarToast("Stock maximo alcanzado para " + producto.nombre + " (" + stockMaximo + " uds.).", "alerta");
                return false;
            }
            existente.cantidad += cantidad;
        } else {
            carritoInventario.push({
                id: producto.id,
                nombre: producto.nombre,
                categoria: producto.categoria,
                precio: parseFloat(producto.precio),
                stock: stockMaximo,
                cantidad: cantidad
            });
        }

        renderizarCarrito();
        mostrarToast("Agregado al pedido: " + producto.nombre, "exito");
        return true;
    }

    function registrarReservaEnCarrito(unidades) {
        const indiceReserva = carritoInventario.findIndex(function (item) {
            return item.id === "RES-LOTE-40";
        });
        if (indiceReserva !== -1) {
            carritoInventario.splice(indiceReserva, 1);
        }
        carritoInventario.push({
            id: "RES-LOTE-40",
            nombre: "Reserva de Lotes Especiales / Asesoria Farmaceutica",
            categoria: "servicios",
            precio: TARIFA_RESERVA,
            stock: null,
            cantidad: unidades
        });
        renderizarCarrito();
    }

    function detenerTemporizadorCheckout() {
        if (intervaloCheckout !== null) {
            clearInterval(intervaloCheckout);
            intervaloCheckout = null;
        }
    }

    function actualizarVistaTemporizador() {
        const porcentaje = (segundosRestantes / TIEMPO_MAXIMO_CHECKOUT) * 100;
        $("#temporizador-texto").text(formatearCuentaRegresiva(segundosRestantes));
        $("#barra-progreso-tiempo").css("width", porcentaje + "%");

        if (segundosRestantes <= 10) {
            $("#temporizador-texto").addClass("urgente");
            $("#barra-progreso-tiempo").addClass("urgente");
        } else {
            $("#temporizador-texto").removeClass("urgente");
            $("#barra-progreso-tiempo").removeClass("urgente");
        }
    }

    function cerrarModalCheckout() {
        detenerTemporizadorCheckout();
        $("#modal-checkout-overlay").fadeOut(280);
    }

    function iniciarTemporizadorCheckout() {
        detenerTemporizadorCheckout();
        segundosRestantes = TIEMPO_MAXIMO_CHECKOUT;
        actualizarVistaTemporizador();

        intervaloCheckout = setInterval(function () {
            segundosRestantes -= 1;
            actualizarVistaTemporizador();

            if (segundosRestantes <= 0) {
                detenerTemporizadorCheckout();
                $("#modal-checkout-overlay").fadeOut(320);
                registrarEventoBitacora(
                    "TARIFA PROTEGIDA",
                    "Tarifa Flash Expirada (00:00). Ventana de confirmacion cerrada automaticamente.",
                    "transaccion"
                );
                mostrarToast("Tarifa Flash Expirada. El tiempo de 00:30 concluyo, inicie la reserva nuevamente.", "alerta");
            }
        }, 1000);
    }

    function actualizarBadgeCampo($campo, $badge, esValido, texto) {
        $campo.removeClass("campo-valido campo-invalido");
        $badge.removeClass("valido aviso").text("");
        if (!texto) {
            return;
        }
        $campo.addClass(esValido ? "campo-valido" : "campo-invalido");
        $badge.addClass(esValido ? "valido" : "aviso").text(texto);
    }

    function evaluarCampoCheckout($campo) {
        const valor = String($campo.val()).trim();
        const idCampo = $campo.attr("id");
        const $badge = $campo.closest(".campo-grupo").find(".estado-validacion-campo");

        if (valor === "") {
            actualizarBadgeCampo($campo, $badge, false, $campo.is("select") ? "Seleccione opcion" : "Campo requerido");
            return false;
        }
        if (idCampo === "input-cliente-correo" && !EXPRESION_CORREO.test(valor)) {
            actualizarBadgeCampo($campo, $badge, false, "Formato: correo@dominio.com");
            return false;
        }
        if ((idCampo === "input-cliente-documento" || idCampo === "input-cliente-telefono") && valor.length < 5) {
            actualizarBadgeCampo($campo, $badge, false, "Minimo 5 caracteres");
            return false;
        }
        if ((idCampo === "input-cliente-nombre" || idCampo === "input-cliente-direccion") && valor.length < 3) {
            actualizarBadgeCampo($campo, $badge, false, "Minimo 3 caracteres");
            return false;
        }

        actualizarBadgeCampo($campo, $badge, true, "Valido");
        return true;
    }

    function limpiarErroresFormulario() {
        $("#formulario-checkout .campo-validable").removeClass("campo-invalido campo-valido");
        $("#formulario-checkout .estado-validacion-campo").removeClass("valido aviso").text("");
    }

    function abrirModalCheckout() {
        if (carritoInventario.length === 0) {
            mostrarToast("Agregue al menos un medicamento, insumo o paquete antes de confirmar.", "alerta");
            registrarEventoBitacora("VALIDACION CARRITO", "Intento de abrir Checkout con el carrito vacio.", "transaccion");
            return;
        }

        $("#panel-carrito-drawer").stop(true, true).fadeOut(160);
        $("#carrito-drawer-overlay").stop(true, true).fadeOut(160);
        $("#btn-toggle-carrito").removeClass("activo").attr("aria-expanded", "false");

        limpiarErroresFormulario();
        $("#modal-checkout-overlay").css("display", "flex").hide().fadeIn(240);
        iniciarTemporizadorCheckout();
        registrarEventoBitacora("MODAL CHECKOUT", "Apertura de modal con tarifa protegida de 00:30.", "transaccion");
    }

    $(document).on("click", "[data-log]", function () {
        const etiquetaLog = String($(this).attr("data-log"));
        const tipoElemento = this.tagName.toLowerCase();
        if (tipoElemento === "select" || tipoElemento === "input") {
            return;
        }

        let categoriaMetrica = "click";
        if (etiquetaLog.indexOf("Filtro") !== -1 || etiquetaLog.indexOf("Buscador") !== -1 || etiquetaLog.indexOf("Catalogo") !== -1) {
            categoriaMetrica = "busqueda";
        } else if (etiquetaLog.indexOf("Carrito") !== -1 || etiquetaLog.indexOf("Paquetes") !== -1 || etiquetaLog.indexOf("Checkout") !== -1 || etiquetaLog.indexOf("Cotizador") !== -1 || etiquetaLog.indexOf("Contacto") !== -1) {
            categoriaMetrica = "transaccion";
        }

        registrarEventoBitacora("ACCION DE INTERFAZ (" + tipoElemento + ")", etiquetaLog, categoriaMetrica);
    });

    $(document).on("change", "select[data-log]", function () {
        const etiquetaLog = String($(this).attr("data-log"));
        const valorSeleccionado = $(this).find("option:selected").text();
        const categoriaMetrica = etiquetaLog.indexOf("Checkout") !== -1 ? "transaccion" : "busqueda";
        registrarEventoBitacora("SELECCION DE OPCION", etiquetaLog + " -> " + valorSeleccionado, categoriaMetrica);
    });

    $(document).on("keyup", "input[data-log]", function () {
        const etiquetaLog = $(this).attr("data-log");
        const valorActual = $(this).val().trim();
        registrarEventoBitacora("CONSULTA EN CAMPO", etiquetaLog + ' -> "' + (valorActual || "vacio") + '"', "busqueda");
    });

    const botonTema = document.getElementById("btn-alternar-tema");
    const textoBotonTema = document.getElementById("texto-boton-tema");

    function aplicarTemaGuardado(tema) {
        document.body.classList.toggle("modo-oscuro", tema === "oscuro");
        document.body.classList.toggle("modo-claro", tema !== "oscuro");
        textoBotonTema.textContent = tema === "oscuro" ? "Modo Claro" : "Modo Oscuro";
    }

    botonTema.addEventListener("click", function () {
        document.body.classList.toggle("modo-oscuro");
        document.body.classList.toggle("modo-claro");
        const temaActual = document.body.classList.contains("modo-oscuro") ? "oscuro" : "claro";
        textoBotonTema.textContent = temaActual === "oscuro" ? "Modo Claro" : "Modo Oscuro";
        localStorage.setItem(CLAVE_TEMA, temaActual);
        mostrarToast("Interfaz actualizada a Modo " + (temaActual === "oscuro" ? "Oscuro" : "Claro") + ".", "info");
    });

    aplicarTemaGuardado(localStorage.getItem(CLAVE_TEMA) || "claro");

    $("#btn-menu").on("click", function () {
        const $menuMovil = $("#menu-movil");
        const seraVisible = !$menuMovil.is(":visible");
        if (seraVisible && $("#panel-carrito-drawer").is(":visible")) {
            $("#panel-carrito-drawer").stop(true, true).fadeOut(160);
            $("#carrito-drawer-overlay").stop(true, true).fadeOut(160);
            $("#btn-toggle-carrito").removeClass("activo").attr("aria-expanded", "false");
        }
        $(this).toggleClass("activo", seraVisible);
        $menuMovil.stop(true, true).slideToggle(240);
    });

    $(document).on("click", function (evento) {
        const $menuMovil = $("#menu-movil");
        if ($menuMovil.is(":visible") && !$(evento.target).closest("#menu-movil, #btn-menu").length) {
            $menuMovil.stop(true, true).slideUp(200);
            $("#btn-menu").removeClass("activo");
        }
    });

    $(".btn-menu-vista").on("click", function () {
        const vistaDestino = $(this).attr("data-vista");

        $(".btn-menu-vista").removeClass("activo");
        $(this).addClass("activo");

        $(".vista-seccion").addClass("oculto").removeClass("vista-activa");
        $("#" + vistaDestino).removeClass("oculto").addClass("vista-activa").hide().fadeIn(220);

        $("#menu-movil").slideUp(200);
        $("#btn-menu").removeClass("activo");
    });

    $("#btn-toggle-carrito").on("click", function () {
        const $drawer = $("#panel-carrito-drawer");
        const seraVisible = !$drawer.is(":visible");
        if (seraVisible && $("#menu-movil").is(":visible")) {
            $("#menu-movil").stop(true, true).slideUp(160);
            $("#btn-menu").removeClass("activo");
        }
        $drawer.stop(true, true).fadeToggle(200);
        $("#carrito-drawer-overlay").stop(true, true).fadeToggle(200);
        $(this).toggleClass("activo", seraVisible).attr("aria-expanded", seraVisible ? "true" : "false");
    });

    $("#btn-cerrar-drawer-carrito, #carrito-drawer-overlay").on("click", function () {
        $("#panel-carrito-drawer").stop(true, true).fadeOut(200);
        $("#carrito-drawer-overlay").stop(true, true).fadeOut(200);
        $("#btn-toggle-carrito").removeClass("activo").attr("aria-expanded", "false");
    });

    $("#btn-toggle-cascada").on("click", function () {
        const $panelCascada = $("#filtros-cascada");
        const seraVisible = !$panelCascada.is(":visible");
        $panelCascada.stop(true, true).slideToggle(200);
        $(this).toggleClass("activo", seraVisible).attr("aria-expanded", seraVisible ? "true" : "false");
    });

    function actualizarEstadoRed() {
        if (navigator.onLine) {
            $('#estadoRed').text('En Linea').css('background', '#dcfce7').css('color', '#14532d');
        } else {
            $('#estadoRed').text('Modo Offline Activo (Datos Locales)').css('background', '#ffedd5').css('color', '#78350f');
        }
    }
    $(window).on('online offline', actualizarEstadoRed);
    actualizarEstadoRed();

    $(window).on("online offline", function (evento) {
        registrarEventoBitacora("ESTADO DE RED", evento.type === "online" ? "Conexion restablecida." : "Sin conexion: operando con datos locales.", "click");
        mostrarToast(evento.type === "online" ? "Conexion restablecida." : "Sin conexion. Operando con datos locales.", evento.type === "online" ? "exito" : "alerta");
    });

    const CATALOGO_RESPALDO = [
        {
            id: "QF-101",
            sku: "QF-AN-PAR500-C100",
            orden: 1,
            nombre: "Paracetamol 500 mg Comprimidos",
            categoria: "destacados",
            subcategoria: "analgesicos",
            principioActivo: "Paracetamol 500 mg",
            presentacion: "Caja x 100 comprimidos en blister",
            precio: 45.00,
            stock: 320,
            descripcion: "Analgesico y antipiretico de alta rotacion para dispensacion hospitalaria y farmacia institucional.",
            fichaTecnica: "Posologia adulto: 1 comprimido cada 6 a 8 horas. Dosis maxima 4 g/dia. Registro sanitario vigente AGEMED. Conservar por debajo de 30 C.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Ccircle cx='32' cy='32' r='17' fill='%23ffffff'/%3E%3Crect x='17' y='30' width='30' height='4' rx='2' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-102",
            sku: "QF-AN-IBU400-C50",
            orden: 2,
            nombre: "Ibuprofeno 400 mg Comprimidos Recubiertos",
            categoria: "destacados",
            subcategoria: "analgesicos",
            principioActivo: "Ibuprofeno 400 mg",
            presentacion: "Caja x 50 comprimidos recubiertos",
            precio: 38.50,
            stock: 260,
            descripcion: "Antiinflamatorio no esteroideo indicado para dolor agudo, procesos inflamatorios y cuadros febriles.",
            fichaTecnica: "Posologia adulto: 1 comprimido cada 8 horas con alimentos. Contraindicado en ulcera peptica activa. Registro sanitario vigente.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Ccircle cx='32' cy='32' r='17' fill='%23ffffff'/%3E%3Crect x='17' y='30' width='30' height='4' rx='2' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-103",
            sku: "QF-AN-DIC75-A10",
            orden: 3,
            nombre: "Diclofenaco Sodico 75 mg/3 mL Inyectable",
            categoria: "destacados",
            subcategoria: "analgesicos",
            principioActivo: "Diclofenaco Sodico 75 mg",
            presentacion: "Caja x 10 ampollas de 3 mL",
            precio: 62.00,
            stock: 140,
            descripcion: "Analgesico antiinflamatorio de administracion intramuscular para manejo de dolor moderado a severo.",
            fichaTecnica: "Via intramuscular profunda. 1 ampolla cada 24 horas, maximo 2 dias consecutivos. Uso exclusivo bajo prescripcion medica.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Ccircle cx='32' cy='32' r='17' fill='%23ffffff'/%3E%3Crect x='17' y='30' width='30' height='4' rx='2' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-104",
            sku: "QF-AB-AMX500-C21",
            orden: 4,
            nombre: "Amoxicilina 500 mg Capsulas",
            categoria: "destacados",
            subcategoria: "antibioticos",
            principioActivo: "Amoxicilina Trihidrato 500 mg",
            presentacion: "Caja x 21 capsulas",
            precio: 54.00,
            stock: 210,
            descripcion: "Antibiotico betalactamico de amplio espectro para infecciones respiratorias, urinarias y de tejidos blandos.",
            fichaTecnica: "Posologia adulto: 1 capsula cada 8 horas durante 7 dias. Venta bajo receta medica. Verificar antecedentes de alergia a penicilinas.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Cg transform='rotate(-40 32 32)'%3E%3Crect x='12' y='23' width='40' height='18' rx='9' fill='%23ffffff'/%3E%3Cpath d='M32 23 H43 A9 9 0 0 1 43 41 H32 Z' fill='%2338bdf8'/%3E%3C/g%3E%3C/svg%3E"
        },
        {
            id: "QF-105",
            sku: "QF-AB-CEF1G-FA1",
            orden: 5,
            nombre: "Ceftriaxona 1 g Polvo para Inyectable",
            categoria: "destacados",
            subcategoria: "antibioticos",
            principioActivo: "Ceftriaxona Sodica 1 g",
            presentacion: "Frasco ampolla con diluyente de 10 mL",
            precio: 28.00,
            stock: 180,
            descripcion: "Cefalosporina de tercera generacion de uso hospitalario para infecciones graves y profilaxis quirurgica.",
            fichaTecnica: "Via IV o IM. 1 a 2 g cada 24 horas segun indicacion. Reconstituir inmediatamente antes de su uso. Registro sanitario vigente.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Cg transform='rotate(-40 32 32)'%3E%3Crect x='12' y='23' width='40' height='18' rx='9' fill='%23ffffff'/%3E%3Cpath d='M32 23 H43 A9 9 0 0 1 43 41 H32 Z' fill='%2338bdf8'/%3E%3C/g%3E%3C/svg%3E"
        },
        {
            id: "QF-106",
            sku: "QF-AB-AZI500-C3",
            orden: 6,
            nombre: "Azitromicina 500 mg Comprimidos",
            categoria: "destacados",
            subcategoria: "antibioticos",
            principioActivo: "Azitromicina Dihidrato 500 mg",
            presentacion: "Caja x 3 comprimidos recubiertos",
            precio: 41.00,
            stock: 150,
            descripcion: "Macrolido de dosis unica diaria para infecciones respiratorias altas y bajas en esquemas cortos.",
            fichaTecnica: "Posologia adulto: 1 comprimido diario durante 3 dias. Administrar 1 hora antes o 2 horas despues de comidas. Venta bajo receta.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f4c81'/%3E%3Cg transform='rotate(-40 32 32)'%3E%3Crect x='12' y='23' width='40' height='18' rx='9' fill='%23ffffff'/%3E%3Cpath d='M32 23 H43 A9 9 0 0 1 43 41 H32 Z' fill='%2338bdf8'/%3E%3C/g%3E%3C/svg%3E"
        },
        {
            id: "QF-107",
            sku: "QF-BS-GNIT-M100",
            orden: 7,
            nombre: "Guantes de Nitrilo Esteriles Talla M",
            categoria: "insumos",
            subcategoria: "bioseguridad",
            principioActivo: "Nitrilo sintetico libre de latex y polvo",
            presentacion: "Caja x 100 unidades talla M",
            precio: 85.00,
            stock: 400,
            descripcion: "Guantes de examen esteriles de alta resistencia a la perforacion para procedimientos clinicos.",
            fichaTecnica: "Norma EN 455 y ASTM D6319. Espesor 0.12 mm. Ambidiestros con borde enrollado. Esterilizados por oxido de etileno.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230284c7'/%3E%3Cpath d='M32 12 L49 19 V31 C49 42 41 49 32 52 C23 49 15 42 15 31 V19 Z' fill='%23ffffff'/%3E%3Cpath d='M24 32 L30 38 L41 26' stroke='%230284c7' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: "QF-108",
            sku: "QF-BS-MASQ3-C50",
            orden: 8,
            nombre: "Mascarilla Quirurgica Tricapa",
            categoria: "insumos",
            subcategoria: "bioseguridad",
            principioActivo: "Polipropileno no tejido de tres capas con filtro BFE 98%",
            presentacion: "Caja x 50 unidades",
            precio: 35.00,
            stock: 600,
            descripcion: "Mascarilla descartable con clip nasal ajustable para areas quirurgicas y atencion ambulatoria.",
            fichaTecnica: "Tipo IIR segun EN 14683. Eficiencia de filtracion bacteriana mayor o igual al 98%. Resistente a salpicaduras. Uso unico.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230284c7'/%3E%3Cpath d='M32 12 L49 19 V31 C49 42 41 49 32 52 C23 49 15 42 15 31 V19 Z' fill='%23ffffff'/%3E%3Cpath d='M24 32 L30 38 L41 26' stroke='%230284c7' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"
        },
        {
            id: "QF-109",
            sku: "QF-PA-SF09-B1000",
            orden: 9,
            nombre: "Solucion Fisiologica Cloruro de Sodio 0.9%",
            categoria: "insumos",
            subcategoria: "parenteral",
            principioActivo: "Cloruro de Sodio 0.9 g / 100 mL",
            presentacion: "Bolsa flexible de 1000 mL",
            precio: 18.50,
            stock: 500,
            descripcion: "Solucion isotonica esteril para hidratacion, reposicion de electrolitos y vehiculo de medicamentos.",
            fichaTecnica: "Via intravenosa. Apirogena y esteril. Sistema cerrado de bolsa colapsable. Desechar el remanente tras su apertura.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230284c7'/%3E%3Cpath d='M32 11 C32 11 17 29 17 38 A15 15 0 0 0 47 38 C47 29 32 11 32 11 Z' fill='%23ffffff'/%3E%3Crect x='30' y='32' width='4' height='12' fill='%230284c7'/%3E%3Crect x='26' y='36' width='12' height='4' fill='%230284c7'/%3E%3C/svg%3E"
        },
        {
            id: "QF-110",
            sku: "QF-PA-VENM-U1",
            orden: 10,
            nombre: "Equipo de Venoclisis Macrogotero",
            categoria: "insumos",
            subcategoria: "parenteral",
            principioActivo: "PVC grado medico libre de DEHP",
            presentacion: "Unidad esteril en empaque individual",
            precio: 6.50,
            stock: 900,
            descripcion: "Set de infusion por gravedad con camara de goteo, regulador de flujo y conector Luer Lock.",
            fichaTecnica: "20 gotas = 1 mL. Longitud de linea 150 cm. Filtro de particulas de 15 micras. Esteril por oxido de etileno. Uso unico.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230284c7'/%3E%3Cpath d='M32 11 C32 11 17 29 17 38 A15 15 0 0 0 47 38 C47 29 32 11 32 11 Z' fill='%23ffffff'/%3E%3Crect x='30' y='32' width='4' height='12' fill='%230284c7'/%3E%3Crect x='26' y='36' width='12' height='4' fill='%230284c7'/%3E%3C/svg%3E"
        },
        {
            id: "QF-111",
            sku: "QF-PA-CAT20G-C50",
            orden: 11,
            nombre: "Cateter Intravenoso Periferico 20G",
            categoria: "insumos",
            subcategoria: "parenteral",
            principioActivo: "Poliuretano radiopaco con aguja de acero inoxidable",
            presentacion: "Caja x 50 unidades",
            precio: 120.00,
            stock: 150,
            descripcion: "Cateter de acceso venoso periferico con alas de fijacion y valvula de inyeccion.",
            fichaTecnica: "Calibre 20G x 32 mm. Flujo 60 mL/min. Codigo de color rosado ISO 10555. Esteril y apirogeno.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230284c7'/%3E%3Cpath d='M32 11 C32 11 17 29 17 38 A15 15 0 0 0 47 38 C47 29 32 11 32 11 Z' fill='%23ffffff'/%3E%3Crect x='30' y='32' width='4' height='12' fill='%230284c7'/%3E%3Crect x='26' y='36' width='12' height='4' fill='%230284c7'/%3E%3C/svg%3E"
        },
        {
            id: "QF-112",
            sku: "QF-SV-FVIG-MES",
            orden: 12,
            nombre: "Programa de Farmacovigilancia Institucional",
            categoria: "servicios",
            subcategoria: "auditoria",
            principioActivo: "Servicio profesional de quimicos farmaceuticos acreditados",
            presentacion: "Suscripcion mensual por establecimiento",
            precio: 1200.00,
            stock: 10,
            descripcion: "Monitoreo de reacciones adversas, reportes regulatorios y capacitacion al personal de salud.",
            fichaTecnica: "Incluye notificacion a la autoridad sanitaria, informe mensual de seguridad y auditoria trimestral de dispensacion.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Crect x='18' y='15' width='28' height='36' rx='4' fill='%23ffffff'/%3E%3Crect x='25' y='11' width='14' height='8' rx='2' fill='%2338bdf8'/%3E%3Crect x='24' y='27' width='16' height='3' rx='1' fill='%230f172a'/%3E%3Crect x='24' y='34' width='16' height='3' rx='1' fill='%230f172a'/%3E%3Crect x='24' y='41' width='10' height='3' rx='1' fill='%230f172a'/%3E%3C/svg%3E"
        },
        {
            id: "QF-113",
            sku: "QF-SV-CCAL-LOTE",
            orden: 13,
            nombre: "Control de Calidad Analitico por Lote",
            categoria: "servicios",
            subcategoria: "auditoria",
            principioActivo: "Laboratorio de control de calidad certificado",
            presentacion: "Analisis completo por lote",
            precio: 650.00,
            stock: 15,
            descripcion: "Verificacion fisicoquimica y microbiologica de lotes recibidos con emision de certificado de analisis.",
            fichaTecnica: "Ensayos de valoracion, disolucion, uniformidad de contenido y limite microbiano segun farmacopea USP vigente.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Crect x='18' y='15' width='28' height='36' rx='4' fill='%23ffffff'/%3E%3Crect x='25' y='11' width='14' height='8' rx='2' fill='%2338bdf8'/%3E%3Crect x='24' y='27' width='16' height='3' rx='1' fill='%230f172a'/%3E%3Crect x='24' y='34' width='16' height='3' rx='1' fill='%230f172a'/%3E%3Crect x='24' y='41' width='10' height='3' rx='1' fill='%230f172a'/%3E%3C/svg%3E"
        },
        {
            id: "QF-114",
            sku: "QF-SV-FRIO-DESP",
            orden: 14,
            nombre: "Logistica de Cadena de Frio 2 a 8 C",
            categoria: "servicios",
            subcategoria: "cadena-frio",
            principioActivo: "Transporte refrigerado validado con registro de temperatura",
            presentacion: "Despacho refrigerado por ruta urbana",
            precio: 280.00,
            stock: 25,
            descripcion: "Distribucion de vacunas, insulinas y biologicos con trazabilidad termica continua.",
            fichaTecnica: "Contenedores isotermicos calificados, data logger con reporte descargable y entrega en ventana horaria garantizada.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Crect x='28' y='11' width='8' height='30' rx='4' fill='%23ffffff'/%3E%3Ccircle cx='32' cy='45' r='9' fill='%23ffffff'/%3E%3Crect x='30.5' y='22' width='3' height='20' fill='%2338bdf8'/%3E%3Ccircle cx='32' cy='45' r='5' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-115",
            sku: "QF-SV-FRIO-ALM",
            orden: 15,
            nombre: "Almacenamiento Refrigerado de Biologicos",
            categoria: "servicios",
            subcategoria: "cadena-frio",
            principioActivo: "Camaras frigorificas con monitoreo remoto 24/7",
            presentacion: "Posicion de almacenaje mensual",
            precio: 420.00,
            stock: 12,
            descripcion: "Custodia de productos termosensibles en camaras calificadas con alarmas de desviacion.",
            fichaTecnica: "Rango controlado de 2 a 8 C. Respaldo electrico redundante. Reporte mensual de mapeo termico y excursiones.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E%3Crect x='28' y='11' width='8' height='30' rx='4' fill='%23ffffff'/%3E%3Ccircle cx='32' cy='45' r='9' fill='%23ffffff'/%3E%3Crect x='30.5' y='22' width='3' height='20' fill='%2338bdf8'/%3E%3Ccircle cx='32' cy='45' r='5' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-116",
            sku: "QF-KE-BOTQ-45P",
            orden: 16,
            nombre: "Botiquin de Emergencia Clinica Institucional",
            categoria: "kits",
            subcategoria: "emergencia",
            principioActivo: "Surtido de medicamentos e insumos de primera respuesta",
            presentacion: "Maletin rigido con 45 piezas",
            precio: 690.00,
            stock: 20,
            descripcion: "Kit completo para areas de atencion inmediata, empresas y unidades moviles de salud.",
            fichaTecnica: "Incluye gasas, vendas, antisepticos, analgesicos, soluciones, termometro digital y manual de uso. Inventario con fecha de vencimiento.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23075985'/%3E%3Crect x='14' y='20' width='36' height='28' rx='5' fill='%23ffffff'/%3E%3Crect x='25' y='14' width='14' height='8' rx='2' fill='none' stroke='%23ffffff' stroke-width='3'/%3E%3Crect x='29.5' y='26' width='5' height='16' fill='%230284c7'/%3E%3Crect x='24' y='31.5' width='16' height='5' fill='%230284c7'/%3E%3C/svg%3E"
        },
        {
            id: "QF-117",
            sku: "QF-KE-REAN-BAS",
            orden: 17,
            nombre: "Kit de Reanimacion Basica",
            categoria: "kits",
            subcategoria: "emergencia",
            principioActivo: "Equipamiento de soporte vital basico",
            presentacion: "Bolso de transporte con 18 componentes",
            precio: 1150.00,
            stock: 8,
            descripcion: "Resucitador manual, canulas orofaringeas y mascarillas para soporte respiratorio inmediato.",
            fichaTecnica: "Bolsa autoinflable adulto 1600 mL, reservorio de oxigeno, 4 canulas Guedel y mascarillas de silicona reutilizables.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23075985'/%3E%3Crect x='14' y='20' width='36' height='28' rx='5' fill='%23ffffff'/%3E%3Crect x='25' y='14' width='14' height='8' rx='2' fill='none' stroke='%23ffffff' stroke-width='3'/%3E%3Crect x='29.5' y='26' width='5' height='16' fill='%230284c7'/%3E%3Crect x='24' y='31.5' width='16' height='5' fill='%230284c7'/%3E%3C/svg%3E"
        },
        {
            id: "QF-118",
            sku: "QF-KQ-SETQ-12P",
            orden: 18,
            nombre: "Set Quirurgico Descartable Basico",
            categoria: "kits",
            subcategoria: "quirurgico",
            principioActivo: "Campos y batas de SMS esteril",
            presentacion: "Set esteril de 12 piezas",
            precio: 210.00,
            stock: 60,
            descripcion: "Paquete quirurgico listo para uso en procedimientos menores y cirugia ambulatoria.",
            fichaTecnica: "Incluye 2 batas, campo fenestrado, campos auxiliares, cubre mesa y compresas. Esterilizado por oxido de etileno.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23075985'/%3E%3Crect x='14' y='18' width='36' height='30' rx='5' fill='%23ffffff'/%3E%3Cpath d='M22 40 L38 24' stroke='%23075985' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='40' cy='22' r='3' fill='%23075985'/%3E%3Crect x='20' y='28' width='10' height='3' rx='1' fill='%2338bdf8'/%3E%3Crect x='34' y='38' width='10' height='3' rx='1' fill='%2338bdf8'/%3E%3C/svg%3E"
        },
        {
            id: "QF-119",
            sku: "QF-KQ-SUT-ESTR",
            orden: 19,
            nombre: "Kit de Sutura Esteril",
            categoria: "kits",
            subcategoria: "quirurgico",
            principioActivo: "Instrumental descartable de acero inoxidable",
            presentacion: "Kit individual de 7 piezas",
            precio: 95.00,
            stock: 120,
            descripcion: "Instrumental de sutura de uso unico para salas de emergencia y consultorios.",
            fichaTecnica: "Porta agujas, pinza de diseccion, tijera, gasas, campo y bandeja. Esteril, apirogeno y de uso unico.",
            portada: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23075985'/%3E%3Crect x='14' y='18' width='36' height='30' rx='5' fill='%23ffffff'/%3E%3Cpath d='M22 40 L38 24' stroke='%23075985' stroke-width='3' stroke-linecap='round'/%3E%3Ccircle cx='40' cy='22' r='3' fill='%23075985'/%3E%3Crect x='20' y='28' width='10' height='3' rx='1' fill='%2338bdf8'/%3E%3Crect x='34' y='38' width='10' height='3' rx='1' fill='%2338bdf8'/%3E%3C/svg%3E"
        }
    ];

    function renderizarCatalogo(medicamentos, origenDatos) {
        let html = '';
        medicamentos.forEach(item => {
            html += `
            <article class="tarjeta-producto" data-id="${item.id}" data-nombre="${item.nombre}" data-categoria="${item.categoria}" data-subcategoria="${item.subcategoria}" data-activo="${item.principioActivo}" data-precio="${item.precio}" data-stock="${item.stock}" data-orden="${item.orden}">
                <div class="tarjeta-cabecera">
                    <span class="insignia-categoria">${item.categoria}</span>
                    <span class="codigo-sku">COD: ${item.id}</span>
                </div>
                <div class="tarjeta-imagen-bloque">
                    <img src="${item.portada}" alt="${item.nombre}" loading="lazy" width="64" height="64">
                </div>
                <div class="tarjeta-cuerpo">
                    <h3 class="producto-titulo">${item.nombre}</h3>
                    <p class="producto-descripcion">${item.descripcion}</p>
                    <div class="producto-meta">
                        <span>Stock: <strong>${item.stock} uds.</strong></span>
                        <span>SKU: <strong>${item.sku}</strong></span>
                    </div>
                    <button type="button" class="accordion-btn" data-log="Acordeon: Ficha Tecnica ${item.id}">Ver Ficha Tecnica</button>
                    <div class="accordion-panel" style="display: none;">
                        <p><strong>Principio Activo:</strong> ${item.principioActivo}</p>
                        <p><strong>Presentacion:</strong> ${item.presentacion}</p>
                        <p><strong>Especificacion:</strong> ${item.fichaTecnica}</p>
                    </div>
                </div>
                <div class="tarjeta-pie">
                    <div class="precio-bloque">
                        <span class="precio-etiqueta">Precio Unitario</span>
                        <strong class="precio-valor">Bs. ${Number(item.precio).toFixed(2)}</strong>
                    </div>
                    <button type="button" class="btn-primario btn-agregar-carrito" data-id="${item.id}" data-log="Carrito: Agregar ${item.id}">Agregar</button>
                </div>
            </article>`;
        });
        $('#contenedor-tarjetas').html(html);
        catalogoMedicamentos = medicamentos;
        catalogoCargado = true;
        ordenarTarjetasCatalogo($("#selector-orden").val());
        $("#contenedor-tarjetas .tarjeta-producto").hide();
        aplicarFiltrosCatalogo();
        registrarEventoBitacora("FETCH CATALOGO", medicamentos.length + " medicamentos cargados desde " + origenDatos + " con loading=lazy.", "busqueda", true);
    }

    fetch('data/medicamentos.json')
        .then(response => {
            if (!response.ok) throw new Error('Error al cargar catalogo farmaceutico');
            return response.json();
        })
        .then(medicamentos => {
            renderizarCatalogo(medicamentos, "data/medicamentos.json");
        })
        .catch(err => {
            console.warn('Cargando catalogo local de respaldo:', err.message);
            renderizarCatalogo(CATALOGO_RESPALDO, "respaldo local integrado");
        });

    $('#contenedor-tarjetas').off('click', '.btn-agregar-carrito').on('click', '.btn-agregar-carrito', function() {
        let idItem = $(this).closest('.tarjeta-producto').data('id');
        const medicamento = catalogoMedicamentos.find(function (item) {
            return String(item.id) === String(idItem);
        });
        if (!medicamento) {
            return;
        }
        agregarProductoAlCarrito({
            id: medicamento.id,
            nombre: medicamento.nombre,
            categoria: medicamento.categoria,
            precio: medicamento.precio,
            stock: medicamento.stock
        });
    });

    $(document).off('click', '.accordion-btn').on('click', '.accordion-btn', function() {
        $(this).next('.accordion-panel').slideToggle('fast');
        $(this).toggleClass('abierto');
    });

    $('#capa1').on('change', function() {
        let valor = $(this).val();
        let $capa2 = $('#capa2');
        $capa2.html('<option value="">-- Seleccione subcategoria --</option>').prop('disabled', false);
        if (valor === 'destacados') {
            $capa2.append('<option value="analgesicos">Analgesicos y Antiinflamatorios</option>');
            $capa2.append('<option value="antibioticos">Antibioticos de Amplio Espectro</option>');
        } else if (valor === 'insumos') {
            $capa2.append('<option value="bioseguridad">Material de Bioseguridad Esteril</option>');
            $capa2.append('<option value="parenteral">Insumos de Administracion Parenteral</option>');
        } else if (valor === 'servicios') {
            $capa2.append('<option value="auditoria">Farmacovigilancia y Control de Calidad</option>');
            $capa2.append('<option value="cadena-frio">Logistica de Cadena de Frio</option>');
        } else if (valor === 'kits') {
            $capa2.append('<option value="emergencia">Botiquin y Kit de Emergencia Clinica</option>');
            $capa2.append('<option value="quirurgico">Set Quirurgico Descartable</option>');
        } else {
            $capa2.prop('disabled', true);
            $('#resultadoFiltro').text('Seleccione las capas anteriores...');
        }
        categoriaActiva = valor || 'todos';
        subcategoriaActiva = '';
        if (valor) {
            $('#resultadoFiltro').html('Capa 1 Activa: <strong>' + NOMBRES_LINEA[valor] + '</strong> | Seleccione una subcategoria para activar la Capa 3');
        }
        sincronizarBotonesCategoria(categoriaActiva);
        $('#btn-toggle-cascada').removeClass('con-filtro-activo');
        aplicarLineaVisual(categoriaActiva);
        aplicarFiltrosCatalogo();
    });

    $('#capa2').on('change', function() {
        let seleccion = $(this).find('option:selected').text();
        let valorSub = $(this).val();
        $('#resultadoFiltro').html(valorSub ? 'Capa 3 Activa: ' + seleccion : 'Seleccione las capas...');
        subcategoriaActiva = valorSub;
        $('#btn-toggle-cascada').toggleClass('con-filtro-activo', Boolean(valorSub));
        const visibles = aplicarFiltrosCatalogo();
        if (valorSub) {
            $('#resultadoFiltro').append(' <span class="conteo-filtro">' + visibles + ' producto(s) coincidentes</span>');
        }
    });

    const liveContainer = document.getElementById('liveContainer');
    const chatInput = document.getElementById('chatInput');
    const logOutput = document.getElementById('logOutput');

    function logEvent(tipo, mensaje) {
        const hora = new Date().toLocaleTimeString();
        const item = document.createElement('div');
        item.innerHTML = `[${hora}] ${tipo} : ${escaparHtml(mensaje)}`;
        logOutput.prepend(item);
        registrarEventoBitacora('TRANSMISION ' + tipo, mensaje, tipo === 'CHAT_INPUT' ? 'busqueda' : 'transaccion');
    }

    liveContainer.addEventListener('click', (e) => {
        if (e.target.dataset.prod) {
            logEvent('OFERTA CLICK', `Producto seleccionado: ${e.target.dataset.prod}`);
            agregarProductoAlCarrito({
                id: 'LOTE-DIRECTO-ANL',
                nombre: e.target.dataset.prod,
                categoria: 'destacados',
                precio: parseFloat(e.target.dataset.precio || 0),
                stock: null
            });
        } else if (e.target.dataset.action === 'Like') {
            logEvent('LIKE_STREAM', 'El usuario confirmo recepcion en el sistema');
            mostrarToast('Recepcion de lote confirmada en el sistema QUIMFA.', 'exito');
        }
    });

    chatInput.addEventListener('keyup', (e) => {
        logEvent('CHAT_INPUT', `Tecleando consulta: "${e.target.value}"`);
    });

    const variantSelect = document.getElementById('variantSelect');
    const orderForm = document.getElementById('orderForm');
    const userTikTok = document.getElementById('userTikTok');
    const errUserTikTok = $('#errUserTikTok');
    const logDia2 = document.getElementById('logDia2');

    function evaluarUserTikTok() {
        const $campo = $(userTikTok);
        const valor = String($campo.val()).trim();
        if (valor === '') {
            actualizarBadgeCampo($campo, errUserTikTok, false, 'Campo requerido');
            return false;
        }
        if (valor.length < 3) {
            actualizarBadgeCampo($campo, errUserTikTok, false, 'Minimo 3 caracteres');
            return false;
        }
        actualizarBadgeCampo($campo, errUserTikTok, true, 'Valido');
        return true;
    }

    userTikTok.addEventListener('input', evaluarUserTikTok);

    function addLog(tipo, msg) {
        const t = new Date().toLocaleTimeString();
        const row = document.createElement('div');
        row.innerHTML = `[${t}] ${tipo}: ${escaparHtml(msg)}`;
        logDia2.prepend(row);
        registrarEventoBitacora('ORDEN DIRECTA ' + tipo, msg, 'transaccion');
    }

    variantSelect.addEventListener('change', (e) => {
        addLog('CAMBIO VARIANTE', `El cliente selecciono: ${e.target.value}`);
    });

    orderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const variante = variantSelect.value;
        const usuario = userTikTok.value.trim();
        if (!evaluarUserTikTok()) {
            addLog(
                'ORDEN RECHAZADA',
                usuario === ''
                    ? 'Debe ingresar el codigo de farmacia o cliente institucional.'
                    : 'El codigo institucional debe tener al menos 3 caracteres.'
            );
            userTikTok.focus();
            return;
        }
        addLog('COMPRA EXITOSA', `Pedido confirmado para ${usuario} (${variante})`);
        const opcionElegida = variantSelect.options[variantSelect.selectedIndex];
        agregarProductoAlCarrito({
            id: 'VAR-' + variantSelect.selectedIndex,
            nombre: 'Orden Directa: ' + variante,
            categoria: 'destacados',
            precio: parseFloat(opcionElegida.dataset.precio),
            stock: null
        });
        orderForm.reset();
        actualizarBadgeCampo($(userTikTok), errUserTikTok, true, '');
    });

    $('#hrs').on('input', function() {
        $('#total').text($(this).val() * 40); });
    $('#btnModal').on('click', function() {
        const unidades = Math.max(1, parseInt($('#hrs').val(), 10) || 1);
        $('#hrs').val(unidades);
        $('#total').text(unidades * TARIFA_RESERVA);
        registrarReservaEnCarrito(unidades);
        mostrarToast('Reserva registrada: ' + unidades + ' ud(s) x 40 BOB = ' + (unidades * TARIFA_RESERVA) + ' BOB.', 'info');
        abrirModalCheckout();
    });

    $("#buscador-productos").on("keyup", function () {
        terminoBusqueda = $(this).val();
        aplicarFiltrosCatalogo();
    });

    $("#btn-limpiar-busqueda").on("click", function () {
        $("#buscador-productos").val("");
        terminoBusqueda = "";
        aplicarFiltrosCatalogo();
        mostrarToast("Campo de busqueda restablecido.", "info");
    });

    function colapsarPanelCascadaSiAbierto() {
        const $panelCascada = $("#filtros-cascada");
        if ($panelCascada.is(":visible")) {
            $panelCascada.stop(true, true).slideUp(200);
        }
        $("#btn-toggle-cascada").removeClass("activo con-filtro-activo").attr("aria-expanded", "false");
    }

    $("#grupo-filtros-categoria").on("click", ".btn-filtro", function () {
        const categoriaElegida = this.dataset.categoria;
        $("#capa1").val(categoriaElegida === "todos" ? "" : categoriaElegida).trigger("change");
        if (categoriaElegida === "todos") {
            colapsarPanelCascadaSiAbierto();
        }
    });

    $("#btn-restablecer-filtros").on("click", function () {
        $("#buscador-productos").val("");
        terminoBusqueda = "";
        $("#selector-orden").val("predeterminado");
        ordenarTarjetasCatalogo("predeterminado");
        $("#capa1").val("").trigger("change");
        colapsarPanelCascadaSiAbierto();
        mostrarToast("Filtros restablecidos. Mostrando todo el vademecum.", "info");
    });

    $("#selector-orden").on("change", function () {
        ordenarTarjetasCatalogo($(this).val());
    });

    $(".btn-agregar-plan").on("click", function () {
        const boton = this;
        agregarProductoAlCarrito({
            id: boton.dataset.id,
            nombre: boton.dataset.nombre,
            categoria: boton.dataset.categoria,
            precio: parseFloat(boton.dataset.precio),
            stock: null
        });
    });

    $("#lista-items-carrito").on("click", "button[data-accion]", function () {
        const accion = $(this).attr("data-accion");
        const idItem = $(this).attr("data-id");
        const indice = carritoInventario.findIndex(function (item) {
            return item.id === idItem;
        });

        if (indice === -1) {
            return;
        }

        const itemActual = carritoInventario[indice];

        if (accion === "incrementar") {
            if (itemActual.stock && itemActual.cantidad >= itemActual.stock) {
                mostrarToast("Stock maximo alcanzado para " + itemActual.nombre + ".", "alerta");
                return;
            }
            itemActual.cantidad += 1;
        } else if (accion === "disminuir") {
            itemActual.cantidad -= 1;
            if (itemActual.cantidad <= 0) {
                carritoInventario.splice(indice, 1);
                mostrarToast("Producto retirado: " + itemActual.nombre, "info");
            }
        } else if (accion === "eliminar") {
            carritoInventario.splice(indice, 1);
            mostrarToast("Producto eliminado: " + itemActual.nombre, "alerta");
        }

        renderizarCarrito();
    });

    $("#btn-limpiar-carrito").on("click", function () {
        if (carritoInventario.length === 0) {
            mostrarToast("El carrito ya se encuentra vacio.", "info");
            return;
        }

        carritoInventario = [];
        renderizarCarrito();
        mostrarToast("Carrito vaciado correctamente.", "alerta");
        registrarEventoBitacora("CARRITO", "Limpieza total del pedido institucional.", "transaccion");
    });

    $("#btn-abrir-modal-checkout").on("click", function () {
        abrirModalCheckout();
    });

    $("#btn-cerrar-modal, #btn-cancelar-checkout").on("click", function () {
        cerrarModalCheckout();
        mostrarToast("Operacion de checkout cancelada.", "info");
    });

    $("#modal-checkout-overlay").on("click", function (evento) {
        if (evento.target === this) {
            cerrarModalCheckout();
            registrarEventoBitacora("MODAL CHECKOUT", "Cierre de modal por clic en fondo exterior.", "click");
        }
    });

    $("#formulario-checkout").on("input change", ".campo-validable", function () {
        evaluarCampoCheckout($(this));
    });

    $("#formulario-checkout").on("submit", function (e) {
        e.preventDefault();

        let formularioValido = true;

        $("#formulario-checkout .campo-validable").each(function () {
            if (!evaluarCampoCheckout($(this))) {
                formularioValido = false;
            }
        });

        if (!formularioValido) {
            mostrarToast("Complete todos los campos obligatorios y verifique el correo electronico.", "error");
            registrarEventoBitacora(
                "VALIDACION CHECKOUT",
                "Validacion pendiente: verifique los campos requeridos antes de confirmar.",
                "transaccion"
            );
            return;
        }

        const clienteNombre = $("#input-cliente-nombre").val().trim();
        const metodoPago = $("#select-metodo-pago").val();
        const totalConfirmado = $("#carrito-total").text();
        const unidadesConfirmadas = $("#resumen-cantidad-unidades").text();

        cerrarModalCheckout();

        $("#formulario-checkout")[0].reset();
        limpiarErroresFormulario();

        carritoInventario = [];
        renderizarCarrito();

        mostrarToast(
            "Pedido confirmado para " + clienteNombre + " (" + unidadesConfirmadas + " uds.) por " + totalConfirmado + ".",
            "exito"
        );
        registrarEventoBitacora(
            "ORDEN CONFIRMADA",
            "Pedido emitido para " + clienteNombre + " | " + unidadesConfirmadas + " uds. | " + metodoPago + " | Total: " + totalConfirmado,
            "transaccion"
        );
    });

    const pwaForm = document.getElementById("pwaForm");
    const feedbackContacto = document.getElementById("feedback-contacto");
    const campoNombreContacto = document.getElementById("contacto-nombre");
    const campoCorreoContacto = document.getElementById("contacto-correo");
    const campoMensajeContacto = document.getElementById("contacto-mensaje");
    const errNombre = document.getElementById("errNombre");
    const errCorreo = document.getElementById("errCorreo");
    const errMensaje = document.getElementById("errMensaje");

    function cargarColaFifo() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_COLA_FIFO));
            return Array.isArray(datos) ? datos : [];
        } catch (error) {
            return [];
        }
    }

    function guardarColaFifo(cola) {
        try {
            localStorage.setItem(CLAVE_COLA_FIFO, JSON.stringify(cola));
        } catch (error) {
            console.error("No se pudo guardar la cola FIFO en localStorage:", error);
        }
    }

    function renderizarColaFifo() {
        const cola = cargarColaFifo();
        const $lista = $("#lista-cola-fifo");
        $lista.empty();

        $("#contador-cola-fifo").text(cola.length + " en cola");

        if (!navigator.onLine) {
            $("#estado-modo-cola").text("Sin conexion: resguardo automatico en cola FIFO");
        } else if (modoPruebaColaFifo) {
            $("#estado-modo-cola").text("Simulacion offline activa: los envios ingresan a cola FIFO");
        } else {
            $("#estado-modo-cola").text("En linea: despacho directo");
        }

        if (cola.length === 0) {
            $lista.append('<li class="cola-fifo-vacia">Sin solicitudes pendientes en cola offline.</li>');
            return;
        }

        cola.forEach(function (registro, indice) {
            const $item = $('<li class="item-cola-fifo"></li>')
                .append($('<span class="posicion-cola-fifo"></span>').text("#" + (indice + 1)))
                .append(
                    $('<div class="detalle-cola-fifo"></div>')
                        .append($('<strong></strong>').text(registro.institucion + " (" + registro.correo + ")"))
                        .append($('<p></p>').text(registro.requerimiento))
                )
                .append($('<span class="hora-cola-fifo"></span>').text(registro.fechaHora));
            $lista.append($item);
        });
    }

    function despacharColaFifo() {
        const cola = cargarColaFifo();
        if (cola.length === 0) {
            renderizarColaFifo();
            return 0;
        }

        let despachados = 0;
        while (cola.length > 0) {
            const solicitud = cola.shift();
            despachados++;
            registrarEventoBitacora(
                "COLA FIFO DESPACHADA",
                "Envio #" + despachados + " (First-Out) | " + solicitud.institucion + " (" + solicitud.correo + ") [" + solicitud.fechaHora + "]",
                "transaccion"
            );
            mostrarToast("Cola FIFO enviada (#" + despachados + "): " + solicitud.institucion, "exito");
        }

        guardarColaFifo(cola);
        renderizarColaFifo();
        return despachados;
    }

    function evaluarCampoContacto(campo) {
        const valor = campo.value.trim();
        let $badge = $(errNombre);
        let esValido = false;
        let texto = "";

        if (campo === campoNombreContacto) {
            $badge = $(errNombre);
            if (valor === "") {
                texto = "Campo requerido";
            } else if (valor.length < 3) {
                texto = "Minimo 3 caracteres";
            } else {
                esValido = true;
                texto = "Valido";
            }
        } else if (campo === campoCorreoContacto) {
            $badge = $(errCorreo);
            if (valor === "") {
                texto = "Campo requerido";
            } else if (!EXPRESION_CORREO.test(valor)) {
                texto = "Formato: correo@dominio.com";
            } else {
                esValido = true;
                texto = "Valido";
            }
        } else if (campo === campoMensajeContacto) {
            $badge = $(errMensaje);
            if (valor === "") {
                texto = "Campo requerido";
            } else if (valor.length < 8) {
                texto = "Minimo 8 caracteres";
            } else {
                esValido = true;
                texto = "Valido";
            }
        }

        actualizarBadgeCampo($(campo), $badge, esValido, texto);
        return esValido;
    }

    function limpiarValidacionContacto() {
        [campoNombreContacto, campoCorreoContacto, campoMensajeContacto].forEach(function (campo) {
            $(campo).removeClass("campo-valido campo-invalido");
        });
        [errNombre, errCorreo, errMensaje].forEach(function (badge) {
            $(badge).removeClass("valido aviso").text("");
        });
    }

    [campoNombreContacto, campoCorreoContacto, campoMensajeContacto].forEach(function (campo) {
        campo.addEventListener("input", function () {
            evaluarCampoContacto(campo);
        });
    });

    $("#btn-simular-offline").on("click", function () {
        modoPruebaColaFifo = !modoPruebaColaFifo;
        $(this)
            .toggleClass("activo-simulacion", modoPruebaColaFifo)
            .text(modoPruebaColaFifo ? "Finalizar Simulacion Offline" : "Simular Envio en Cola FIFO");

        if (!modoPruebaColaFifo && navigator.onLine) {
            const totalDespachado = despacharColaFifo();
            if (totalDespachado > 0) {
                mostrarToast("Simulacion finalizada: " + totalDespachado + " solicitud(es) despachada(s) en orden FIFO.", "exito");
            }
        } else {
            renderizarColaFifo();
            mostrarToast(
                modoPruebaColaFifo ? "Modo prueba cola FIFO activado. Los envios quedaran en espera." : "Modo prueba desactivado.",
                "info"
            );
        }
    });

    $("#btn-despachar-cola").on("click", function () {
        const colaActual = cargarColaFifo();
        if (colaActual.length === 0) {
            mostrarToast("No hay solicitudes pendientes en la cola FIFO.", "info");
            return;
        }
        if (!navigator.onLine) {
            mostrarToast("Sin conexion a internet. La cola se enviara al restablecer red.", "alerta");
            return;
        }
        if (modoPruebaColaFifo) {
            modoPruebaColaFifo = false;
            $("#btn-simular-offline").removeClass("activo-simulacion").text("Simular Envio en Cola FIFO");
        }
        despacharColaFifo();
    });

    pwaForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const validoNombre = evaluarCampoContacto(campoNombreContacto);
        const validoCorreo = evaluarCampoContacto(campoCorreoContacto);
        const validoMensaje = evaluarCampoContacto(campoMensajeContacto);

        feedbackContacto.innerHTML = "";

        if (!validoNombre || !validoCorreo || !validoMensaje) {
            feedbackContacto.className = "feedback-formulario feedback-error";
            feedbackContacto.textContent = "Verifique las indicaciones ubicadas en la parte superior derecha de cada campo antes de enviar.";
            registrarEventoBitacora("VALIDACION CONTACTO", "Validacion pendiente en solicitud institucional.", "transaccion");
            return;
        }

        const nuevoRegistro = {
            id: "SOL-" + Date.now(),
            institucion: campoNombreContacto.value.trim(),
            correo: campoCorreoContacto.value.trim(),
            requerimiento: campoMensajeContacto.value.trim(),
            fechaHora: obtenerHoraExacta()
        };

        pwaForm.reset();
        limpiarValidacionContacto();

        if (!navigator.onLine || modoPruebaColaFifo) {
            const cola = cargarColaFifo();
            cola.push(nuevoRegistro);
            guardarColaFifo(cola);
            renderizarColaFifo();

            feedbackContacto.className = "feedback-formulario feedback-exito";
            feedbackContacto.textContent = "Solicitud resguardada en cola FIFO (posicion #" + cola.length + "). El formulario esta listo para ingresar otro registro.";
            registrarEventoBitacora(
                "COLA FIFO ENCOLADA",
                "Registro #" + cola.length + " (First-In) | " + nuevoRegistro.institucion + " (" + nuevoRegistro.correo + ")",
                "transaccion"
            );
            mostrarToast("Guardado en cola FIFO (#" + cola.length + ").", "alerta");
            return;
        }

        feedbackContacto.className = "feedback-formulario feedback-exito";
        feedbackContacto.textContent = "Solicitud enviada correctamente. Un asesor de QUIMFA respondera a " + nuevoRegistro.correo + " en menos de 24 horas.";
        registrarEventoBitacora("CONTACTO INSTITUCIONAL", "Solicitud enviada para " + nuevoRegistro.institucion + ".", "transaccion");
        mostrarToast("Solicitud institucional enviada.", "exito");
    });

    $("#btn-limpiar-bitacora").on("click", function () {
        $("#lista-bitacora-global").empty();
        contadorEventos = 0;
        contadorClicksUI = 0;
        contadorBusquedasFiltros = 0;
        contadorTransacciones = 0;
        sincronizarContadoresBitacora();
        registrarEventoBitacora("SISTEMA", "Bitacora de eventos reiniciada manualmente.", "click");
        mostrarToast("Historial de eventos vaciado.", "info");
    });

    window.addEventListener("online", function () {
        if (!modoPruebaColaFifo) {
            despacharColaFifo();
        } else {
            renderizarColaFifo();
        }
    });

    window.addEventListener("offline", function () {
        renderizarColaFifo();
    });

    window.addEventListener("storage", function (evento) {
        if (evento.key === CLAVE_CARRITO) {
            carritoInventario = cargarCarritoLocal();
            renderizarCarrito();
            registrarEventoBitacora("SINCRONIZACION", "Carrito actualizado desde otra pestana o desde la App Movil.", "transaccion");
        } else if (evento.key === CLAVE_COLA_FIFO) {
            renderizarColaFifo();
        } else if (evento.key === CLAVE_TEMA) {
            aplicarTemaGuardado(evento.newValue || "claro");
        }
    });

    renderizarCarrito();
    renderizarColaFifo();
    aplicarLineaVisual("todos");
    registrarEventoBitacora("SISTEMA", "Catalogo QUIMFA S.A. inicializado en version Desktop.", "click", true);
});
