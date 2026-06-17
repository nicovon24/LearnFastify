/**
 * AUTH SERVICE
 *
 * ¿Por qué la lógica va en el Service y no en el Controller?
 * El controller solo debe saber "qué ruta recibe qué parámetros".
 * La lógica de negocio (hashear passwords, generar tokens, validar usuarios)
 * vive acá. Esto hace que el service sea testeable en aislamiento
 * sin necesidad de simular requests HTTP.
 *
 * @Injectable() → marca la clase como un provider que Nest puede inyectar.
 * InjectRepository(User) → Nest inyecta el repositorio de TypeORM para
 * la entidad User. El repositorio es el objeto que habla con la DB.
 */

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  /**
   * Constructor injection — Nest resuelve automáticamente estas dependencias.
   * No instanciás nada a mano: Nest busca en su contenedor de DI,
   * encuentra los providers registrados en AuthModule, y los inyecta.
   */
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string }> {
    // Verificamos que el email y username no existan ya
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email }, { username: dto.username }],
    });
    if (existing) {
      throw new ConflictException('El email o username ya está en uso');
    }

    // bcrypt.hash() genera un hash seguro del password.
    // El número 10 es el "cost factor" — más alto = más lento = más seguro.
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });

    await this.userRepository.save(user);
    return { message: 'Usuario registrado exitosamente' };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    /**
     * addSelect('user.password') es necesario porque el campo password
     * tiene select: false en la entidad. Sin esto, password vendría undefined.
     */
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username: dto.username })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    /**
     * El payload del JWT es lo que podés leer en el token.
     * JwtStrategy.validate() (ver strategies/jwt.strategy.ts) recibe
     * este payload cuando llega un request con Bearer token.
     */
    const payload = { sub: user.id, username: user.username };
    const accessToken = this.jwtService.sign(payload);

    return { accessToken };
  }
}
