$(document).ready(function () {
    let carritoInventario = [];
    let categoriaActiva = "todos";
    let terminoBusqueda = "";
    let contadorEventos = 0;
    let contadorClicksUI = 0;
    let contadorBusquedasFiltros = 0;
    let contadorTransacciones = 0;
    let intervaloCheckout = null;
    let segundosRestantes = 30;
    const TIEMPO_MAXIMO_CHECKOUT = 30;
    const TASA_IMPUESTO = 0.13;

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

    function sincronizarContadoresBitacora() {
        $("#contador-eventos-log").text(contadorEventos);
        $("#contador-eventos-menu").text(contadorEventos);
        $("#contador-eventos-clicks").text(contadorClicksUI);
        $("#contador-eventos-busquedas").text(contadorBusquedasFiltros);
        $("#contador-eventos-transacciones").text(contadorTransacciones);
    }

    function registrarEventoBitacora(origen, mensaje, categoriaMetrica) {
        contadorEventos++;

        if (categoriaMetrica === "busqueda") {
            contadorBusquedasFiltros++;
        } else if (categoriaMetrica === "transaccion") {
            contadorTransacciones++;
        } else {
            contadorClicksUI++;
        }

        const horaActual = obtenerHoraExacta();
        const itemHtml =
            '<li class="registro-log">' +
                '<div class="log-cabecera">' +
                    '<span class="log-hora">[' + horaActual + ']</span>' +
                    '<span class="log-origen">' + origen + '</span>' +
                '</div>' +
                '<div class="log-mensaje">' + mensaje + '</div>' +
            '</li>';

        $("#lista-bitacora-global").prepend(itemHtml);
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

    function aplicarFiltrosCatalogo() {
        let visibles = 0;
        const texto = terminoBusqueda.toLowerCase().trim();

        $("#contenedor-tarjetas .tarjeta-producto").each(function () {
            const $tarjeta = $(this);
            const categoriaTarjeta = String($tarjeta.attr("data-categoria")).toLowerCase();
            const nombreTarjeta = String($tarjeta.attr("data-nombre")).toLowerCase();
            const idTarjeta = String($tarjeta.attr("data-id")).toLowerCase();
            const descripcionTarjeta = $tarjeta.find(".producto-descripcion").text().toLowerCase();

            const coincideCategoria = (categoriaActiva === "todos") || (categoriaTarjeta === categoriaActiva);
            const coincideTexto = (texto === "") ||
                nombreTarjeta.indexOf(texto) !== -1 ||
                idTarjeta.indexOf(texto) !== -1 ||
                descripcionTarjeta.indexOf(texto) !== -1;

            if (coincideCategoria && coincideTexto) {
                $tarjeta.removeClass("oculto");
                visibles++;
            } else {
                $tarjeta.addClass("oculto");
            }
        });

        const totalTarjetas = $("#contenedor-tarjetas .tarjeta-producto").length;
        $("#indicador-total-catalogo").text(totalTarjetas);
        $("#indicador-visibles-catalogo").text(visibles);

        if (visibles === 0) {
            $("#mensaje-sin-resultados").removeClass("oculto");
        } else {
            $("#mensaje-sin-resultados").addClass("oculto");
        }

        let resumenFiltro = "Mostrando " + visibles + " de " + totalTarjetas + " items disponibles en el catalogo";
        if (categoriaActiva !== "todos") {
            resumenFiltro += " | Categoria: " + categoriaActiva.toUpperCase();
        }
        if (texto !== "") {
            resumenFiltro += ' | Busqueda: "' + terminoBusqueda.trim() + '"';
        }
        $("#texto-estado-filtro").text(resumenFiltro + ".");
    }

    function ordenarTarjetasCatalogo(criterio) {
        const $contenedor = $("#contenedor-tarjetas");
        const listaTarjetas = $contenedor.children(".tarjeta-producto").get();

        listaTarjetas.sort(function (a, b) {
            const $a = $(a);
            const $b = $(b);

            if (criterio === "precio-asc") {
                return parseFloat($a.attr("data-precio")) - parseFloat($b.attr("data-precio"));
            }
            if (criterio === "precio-desc") {
                return parseFloat($b.attr("data-precio")) - parseFloat($a.attr("data-precio"));
            }
            if (criterio === "nombre-asc") {
                return String($a.attr("data-nombre")).localeCompare(String($b.attr("data-nombre")));
            }
            if (criterio === "nombre-desc") {
                return String($b.attr("data-nombre")).localeCompare(String($a.attr("data-nombre")));
            }
            return parseInt($a.attr("data-orden"), 10) - parseInt($b.attr("data-orden"), 10);
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

                const filaHtml =
                    '<li class="item-carrito" data-id="' + item.id + '">' +
                        '<div class="item-carrito-info">' +
                            '<span class="item-carrito-nombre">' + item.nombre + '</span>' +
                            '<span class="item-carrito-detalle">' +
                                item.cantidad + ' x ' + formatearMoneda(item.precio) + ' = <strong>' + formatearMoneda(subtotalItem) + '</strong>' +
                            '</span>' +
                        '</div>' +
                        '<div class="item-carrito-controles">' +
                            '<button type="button" class="btn-cantidad-carrito" data-accion="disminuir" data-id="' + item.id + '" data-log="Carrito: Disminuir cantidad de ' + item.id + '">-</button>' +
                            '<button type="button" class="btn-cantidad-carrito" data-accion="incrementar" data-id="' + item.id + '" data-log="Carrito: Incrementar cantidad de ' + item.id + '">+</button>' +
                            '<button type="button" class="btn-eliminar-item" data-accion="eliminar" data-id="' + item.id + '" data-log="Carrito: Eliminar item ' + item.id + '">X</button>' +
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

        $("#modal-unidades-confirmar").text(cantidadTotalUnidades);
        $("#modal-total-confirmar").text(formatearMoneda(montoTotal));

        $("#badge-cantidad-carrito").text(cantidadTotalUnidades + (cantidadTotalUnidades === 1 ? " ud." : " uds."));
        $("#indicador-productos-carrito").text(cantidadLineasProductos);
        $("#indicador-unidades-carrito").text(cantidadTotalUnidades);
        $("#indicador-importe-carrito").text(formatearMoneda(montoTotal));
    }

    function agregarProductoAlCarrito(producto) {
        const existente = carritoInventario.find(function (item) {
            return item.id === producto.id;
        });

        if (existente) {
            existente.cantidad += 1;
        } else {
            carritoInventario.push({
                id: producto.id,
                nombre: producto.nombre,
                categoria: producto.categoria,
                precio: parseFloat(producto.precio),
                cantidad: 1
            });
        }

        renderizarCarrito();
        mostrarToast("Agregado al pedido: " + producto.nombre, "exito");
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
                    "TEMPORIZADOR ASINCRONO",
                    "Tarifa y reserva expiradas (00:00). Cierre automatico de modal con .fadeOut().",
                    "transaccion"
                );
                mostrarToast("Tarifa y tiempo de reserva expirados (00:30). Inicie el checkout nuevamente.", "alerta");
            }
        }, 1000);
    }

    function limpiarErroresFormulario() {
        $("#formulario-checkout .campo-validable").removeClass("campo-invalido");
        $("#formulario-checkout .campo-grupo").removeClass("con-error");
    }

    function abrirModalCheckout() {
        if (carritoInventario.length === 0) {
            mostrarToast("Agregue al menos un producto o paquete al carrito antes de confirmar.", "alerta");
            registrarEventoBitacora("VALIDACION CARRITO", "Intento de abrir Checkout con el carrito vacio.", "transaccion");
            return;
        }

        limpiarErroresFormulario();
        $("#modal-checkout-overlay").css("display", "flex").hide().fadeIn(240);
        iniciarTemporizadorCheckout();
        registrarEventoBitacora("MODAL CHECKOUT", "Apertura de modal con cuenta regresiva sincronizada en 00:30.", "transaccion");
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
        } else if (etiquetaLog.indexOf("Carrito") !== -1 || etiquetaLog.indexOf("Paquetes") !== -1 || etiquetaLog.indexOf("Checkout") !== -1) {
            categoriaMetrica = "transaccion";
        }

        registrarEventoBitacora("BUBBLING CLICK (" + tipoElemento + ")", etiquetaLog, categoriaMetrica);
    });

    $(document).on("change", "select[data-log]", function () {
        const etiquetaLog = String($(this).attr("data-log"));
        const valorSeleccionado = $(this).find("option:selected").text();
        const categoriaMetrica = etiquetaLog.indexOf("Ordenamiento") !== -1 ? "busqueda" : "transaccion";
        registrarEventoBitacora("BUBBLING CHANGE (select)", etiquetaLog + " -> " + valorSeleccionado, categoriaMetrica);
    });

    $(document).on("keyup", "input[data-log]", function () {
        const etiquetaLog = $(this).attr("data-log");
        const valorActual = $(this).val().trim();
        registrarEventoBitacora("BUBBLING KEYUP (input)", etiquetaLog + ' -> "' + (valorActual || "vacio") + '"', "busqueda");
    });

    $("#btn-alternar-tema").on("click", function () {
        const $cuerpo = $("#app-raiz");
        if ($cuerpo.hasClass("modo-claro")) {
            $cuerpo.removeClass("modo-claro").addClass("modo-oscuro");
            $("#texto-boton-tema").text("Modo Claro");
            mostrarToast("Interfaz actualizada a Modo Oscuro.", "info");
        } else {
            $cuerpo.removeClass("modo-oscuro").addClass("modo-claro");
            $("#texto-boton-tema").text("Modo Oscuro");
            mostrarToast("Interfaz actualizada a Modo Claro.", "info");
        }
    });

    $(".btn-menu-vista").on("click", function () {
        const vistaDestino = $(this).attr("data-vista");

        $(".btn-menu-vista").removeClass("activo");
        $(this).addClass("activo");

        $(".vista-seccion").addClass("oculto").removeClass("vista-activa");
        $("#" + vistaDestino).removeClass("oculto").addClass("vista-activa");
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

    $("#grupo-filtros-categoria").on("click", ".btn-filtro", function () {
        $("#grupo-filtros-categoria .btn-filtro").removeClass("activo");
        $(this).addClass("activo");
        categoriaActiva = $(this).attr("data-categoria");
        aplicarFiltrosCatalogo();
    });

    $("#btn-restablecer-filtros").on("click", function () {
        $("#buscador-productos").val("");
        terminoBusqueda = "";
        categoriaActiva = "todos";
        $("#grupo-filtros-categoria .btn-filtro").removeClass("activo");
        $('#grupo-filtros-categoria .btn-filtro[data-categoria="todos"]').addClass("activo");
        $("#selector-orden").val("predeterminado");
        ordenarTarjetasCatalogo("predeterminado");
        aplicarFiltrosCatalogo();
        mostrarToast("Filtros restablecidos. Mostrando todo el catalogo.", "info");
    });

    $("#selector-orden").on("change", function () {
        const criterio = $(this).val();
        ordenarTarjetasCatalogo(criterio);
    });

    $("#contenedor-tarjetas").on("click", ".btn-agregar-carrito", function () {
        const $tarjeta = $(this).closest(".tarjeta-producto");
        const producto = {
            id: $tarjeta.attr("data-id"),
            nombre: $tarjeta.attr("data-nombre"),
            categoria: $tarjeta.attr("data-categoria"),
            precio: parseFloat($tarjeta.attr("data-precio"))
        };
        agregarProductoAlCarrito(producto);
    });

    $(".btn-agregar-plan").on("click", function () {
        const $boton = $(this);
        const plan = {
            id: $boton.attr("data-id"),
            nombre: $boton.attr("data-nombre"),
            categoria: $boton.attr("data-categoria"),
            precio: parseFloat($boton.attr("data-precio"))
        };
        agregarProductoAlCarrito(plan);
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

        if (accion === "incrementar") {
            carritoInventario[indice].cantidad += 1;
        } else if (accion === "disminuir") {
            carritoInventario[indice].cantidad -= 1;
            if (carritoInventario[indice].cantidad <= 0) {
                const nombreEliminado = carritoInventario[indice].nombre;
                carritoInventario.splice(indice, 1);
                mostrarToast("Producto retirado: " + nombreEliminado, "info");
            }
        } else if (accion === "eliminar") {
            const nombreEliminado = carritoInventario[indice].nombre;
            carritoInventario.splice(indice, 1);
            mostrarToast("Producto eliminado: " + nombreEliminado, "alerta");
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
        registrarEventoBitacora("CARRITO", "Limpieza total de inventario en el carrito.", "transaccion");
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
        const valor = String($(this).val()).trim();
        if (valor !== "") {
            $(this).removeClass("campo-invalido");
            $(this).closest(".campo-grupo").removeClass("con-error");
        }
    });

    $("#formulario-checkout").on("submit", function (e) {
        e.preventDefault();

        let formularioValido = true;
        const expresionCorreo = new RegExp("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

        $("#formulario-checkout .campo-validable").each(function () {
            const $campo = $(this);
            const valor = String($campo.val()).trim();
            const esCorreo = $campo.attr("id") === "input-cliente-correo";

            if (valor === "" || (esCorreo && !expresionCorreo.test(valor))) {
                $campo.addClass("campo-invalido");
                $campo.closest(".campo-grupo").addClass("con-error");
                formularioValido = false;
            } else {
                $campo.removeClass("campo-invalido");
                $campo.closest(".campo-grupo").removeClass("con-error");
            }
        });

        if (!formularioValido) {
            mostrarToast("Complete todos los campos obligatorios y verifique el correo electronico.", "error");
            registrarEventoBitacora(
                "VALIDACION CHECKOUT",
                "Envio bloqueado con e.preventDefault(): campos vacios o formato de correo invalido.",
                "transaccion"
            );
            return;
        }

        const clienteNombre = $("#input-cliente-nombre").val().trim();
        const metodoPago = $("#select-metodo-pago").val();
        const totalConfirmado = $("#carrito-total").text();
        const unidadesConfirmadas = $("#indicador-unidades-carrito").text();

        cerrarModalCheckout();

        $("#formulario-checkout")[0].reset();
        limpiarErroresFormulario();

        carritoInventario = [];
        renderizarCarrito();

        mostrarToast(
            "Orden confirmada con exito para " + clienteNombre + " (" + unidadesConfirmadas + " uds.) por " + totalConfirmado + ".",
            "exito"
        );
        registrarEventoBitacora(
            "ORDEN CONFIRMADA",
            "Compra emitida para " + clienteNombre + " | " + unidadesConfirmadas + " uds. | " + metodoPago + " | Total: " + totalConfirmado,
            "transaccion"
        );
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

    aplicarFiltrosCatalogo();
    renderizarCarrito();
    registrarEventoBitacora("SISTEMA", "Plataforma de Catalogo y Servicios inicializada en Modo Claro.", "click");
});
